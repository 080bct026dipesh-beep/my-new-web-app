"""
tests/test_congestion_zones.py

Unit tests for app.routing.congestion_zones: the CSV-driven, static
geographic-congestion mechanism (distinct from app/db/queries.py's
organic, per-route-segment congestion -- see this module's own
docstring for how the two combine in pathfinder.py). No DB or graph
needed; everything here is pure functions plus a CSV fixture.
"""
import pytest

from app.routing import congestion_zones as cz


@pytest.fixture(autouse=True)
def _reset_cache():
    cz.reset_zones_cache()
    yield
    cz.reset_zones_cache()


def test_score_to_ratio_endpoints():
    """0 -> ~free-flow, 10 -> the documented 4.2 ceiling."""
    assert cz.score_to_ratio(0) == pytest.approx(1.05)
    assert cz.score_to_ratio(10) == pytest.approx(4.2)


def test_radius_for_score_endpoints():
    """200m for negligible, 500m for the worst measured score."""
    assert cz.radius_for_score(0) == pytest.approx(200)
    assert cz.radius_for_score(10) == pytest.approx(500)


def test_load_zones_reads_csv(tmp_path, monkeypatch):
    csv_path = tmp_path / "congestion_zones.csv"
    csv_path.write_text(
        "stop_id,stop_name,lat,lng,score,radius_m,source,real_location_name\n"
        "S0056,Tripureshwor,27.694418,85.314128,10.0,500,measured,Tripureshwor\n"
    )
    monkeypatch.setattr(cz, "ZONES_PATH", csv_path)

    zones = cz.load_zones()
    assert len(zones) == 1
    zone = zones[0]
    assert zone.stop_id == "S0056"
    assert zone.radius_m == pytest.approx(500)
    assert zone.ratio == pytest.approx(cz.score_to_ratio(10.0))


def test_load_zones_missing_file_returns_empty(tmp_path, monkeypatch):
    """No CSV yet (e.g. a fresh checkout before the data file is added)
    should degrade to "no zones" rather than raising."""
    monkeypatch.setattr(cz, "ZONES_PATH", tmp_path / "does_not_exist.csv")
    assert cz.load_zones() == []


def test_load_zones_is_cached_until_reset(tmp_path, monkeypatch):
    csv_path = tmp_path / "congestion_zones.csv"
    csv_path.write_text(
        "stop_id,stop_name,lat,lng,score,radius_m,source,real_location_name\n"
        "S1,A,27.7,85.3,5.0,300,measured,A\n"
    )
    monkeypatch.setattr(cz, "ZONES_PATH", csv_path)

    first = cz.load_zones()
    assert len(first) == 1

    # Rewrite the CSV without invalidating the cache -- load_zones()
    # should keep returning the stale, already-cached result.
    csv_path.write_text(
        "stop_id,stop_name,lat,lng,score,radius_m,source,real_location_name\n"
        "S1,A,27.7,85.3,5.0,300,measured,A\n"
        "S2,B,27.8,85.4,9.0,450,measured,B\n"
    )
    assert cz.load_zones() is first
    assert len(cz.load_zones()) == 1

    cz.reset_zones_cache()
    assert len(cz.load_zones()) == 2


def test_ratio_for_point_inside_and_outside_zone():
    zone = cz.CongestionZone(
        stop_id="S1", name="A", lat=27.7000, lng=85.3100, radius_m=300, ratio=3.0
    )
    assert cz.ratio_for_point(27.7000, 85.3100, zones=[zone]) == pytest.approx(3.0)
    # ~11km away -- well outside a 300m radius.
    assert cz.ratio_for_point(27.8000, 85.3100, zones=[zone]) == pytest.approx(1.0)


def test_ratio_for_point_takes_max_not_sum_of_overlapping_zones():
    """Two overlapping zones shouldn't stack additively -- the worse one
    wins, matching how a single physical traffic jam behaves."""
    weak = cz.CongestionZone(stop_id="S1", name="A", lat=27.7, lng=85.31, radius_m=1000, ratio=1.5)
    strong = cz.CongestionZone(stop_id="S2", name="B", lat=27.7, lng=85.31, radius_m=1000, ratio=4.0)
    assert cz.ratio_for_point(27.7, 85.31, zones=[weak, strong]) == pytest.approx(4.0)


def test_ratio_for_point_no_zones_is_free_flow():
    assert cz.ratio_for_point(27.7, 85.31, zones=[]) == pytest.approx(1.0)


def test_ratio_for_segment_triggers_from_either_endpoint():
    zone = cz.CongestionZone(
        stop_id="S1", name="A", lat=27.7000, lng=85.3100, radius_m=200, ratio=2.5
    )
    # "from" endpoint inside the zone, "to" endpoint far outside.
    assert cz.ratio_for_segment(27.7000, 85.3100, 27.9000, 85.5000, zones=[zone]) == pytest.approx(2.5)
    # "to" endpoint inside the zone, "from" endpoint far outside.
    assert cz.ratio_for_segment(27.9000, 85.5000, 27.7000, 85.3100, zones=[zone]) == pytest.approx(2.5)


def test_ratio_for_segment_neither_endpoint_in_zone():
    zone = cz.CongestionZone(
        stop_id="S1", name="A", lat=27.7000, lng=85.3100, radius_m=200, ratio=2.5
    )
    ratio = cz.ratio_for_segment(27.9000, 85.5000, 28.0000, 85.6000, zones=[zone])
    assert ratio == pytest.approx(1.0)
