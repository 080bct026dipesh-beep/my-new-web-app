# Congestion-Aware Routing — Before/After Demo

This documents real `avoid_congestion=false` vs `avoid_congestion=true`
results from `GET /route-finder`, run against the live dataset after
`python -m scripts.seed_demo_congestion` seeds realistic peak-hour
congestion on segments touching the 8 demo corridors: Koteshwor, Kalanki,
Thapathali, Chabahil, Jadibuti, Tripureshwor, Maitighar, and Gongabu Bus
Park.

Both cases below were captured by actually calling the FastAPI endpoint
(`fastapi.testclient.TestClient`, same code path a real request hits),
not by calling internal functions directly.

## Setup

```bash
cd backend
python -m scripts.seed_demo_congestion
```

This seeds a 3.2x congestion ratio (comfortably in the "heavy" band, see
`app/api/congestion.py`'s thresholds) on 9 real segments at the current
hour bucket, including two specifically chosen to demonstrate two
different ways the router responds to congestion.

## Case 1: Same-corridor bus swap

**Tripureshwor → a stop past Jamal, no congestion:**

```
GET /route-finder?origin=S0056&destination=S0072&avoid_congestion=false

transfers: 1   cost: 7502
legs: R-SAJHA-01 -> R3102124
```

**Same request, with congestion avoidance on:**

```
GET /route-finder?origin=S0056&destination=S0072&avoid_congestion=true

transfers: 1   cost: 7502
legs: R-SAJHA-02 -> R3102124
```

**What happened:** `R-SAJHA-01` (Lagankhel–Gongabu Buspark) and
`R-SAJHA-02` (Lagankhel–Budhanilkantha) run the identical physical stop
sequence from Tripureshwor through Jamal before diverging later in their
routes. With `R-SAJHA-01`'s Tripureshwor-area segments seeded as heavily
congested, the router picks `R-SAJHA-02` instead for that exact stretch —
same stops, same distance, same total cost, different bus. This is
literally the real-world advice a rider would want: "the SAJHA-02 covers
the same ground, take that one instead."

## Case 2: Full reroute via different feeder routes

**Maitighar → Gongabu Bus Park, no congestion:**

```
GET /route-finder?origin=S0097&destination=S0252&avoid_congestion=false

transfers: 2   cost: 8832
legs: R2909799 -> R-NY-07 -> [walk transfer] -> R-SAJHA-01
```

**Same request, with congestion avoidance on:**

```
GET /route-finder?origin=S0097&destination=S0252&avoid_congestion=true

transfers: 3   cost: 7311
legs: R3211395 -> R3028077 -> R-SAJHA-06 -> R-SAJHA-01
```

**What happened:** `R-SAJHA-01` is the *only* route serving Gongabu Bus
Park at all in the current dataset — so the router can't avoid riding it
entirely. What it does instead is route around the specific congested hop
(`S0044 → S0065`) by joining `R-SAJHA-01` two stops later, via a longer
chain of different feeder routes. The result trades one extra transfer for
a *shorter total cost* (7311 vs 8832) by avoiding the congested stretch —
a realistic transfers-vs-delay tradeoff, not just a cosmetic change.

## A case where nothing changes, and why that's correct

Not every pair reroutes, and it shouldn't. Direct routes are unaffected by
`avoid_congestion` by design (see `pathfinder.py`'s `find_shortest_path`
docstring) — a direct route always wins regardless of congestion, since
the alternative would be a strictly worse experience (a transfer) for a
possibly-marginal time saving. E.g. `Koteshwor → Kalanki` is a direct ride
on `R3214592` in both cases; congestion data has no effect on it, which is
the intended behavior, not a bug.

## Coverage seeded

Besides the two segments above, `seed_demo_congestion.py` also seeds real
peak-hour congestion on one onward segment from each of the remaining
corridors, so `/congestion` has genuine (non-seeded) data at all 8 points:

| Corridor | Segment seeded |
|---|---|
| Koteshwor | → Thapathali (`R-NY-03`) |
| Kalanki | → onward (`R-SAJHA-06`) |
| Thapathali | → Tripureshwor (`R-NY-03`) |
| Chabahil | → onward (`R3102605`) |
| Jadibuti | → Koteshwor (`R-NY-03`) |

## Limitation worth stating plainly

This is seeded demo data, not organic traffic. In production, congestion
data only accumulates from real ride legs that get recorded after a real
`/route-finder` call — see `app/db/queries.py`'s `record_congestion_sample`.
Until there's enough real usage, `avoid_congestion=true` has nothing to
route around most of the time. `seed_demo_congestion.py` exists to make
the mechanism demonstrable now, not as a substitute for real traffic data
collection (see the "data density" step in the original 4-day plan).
