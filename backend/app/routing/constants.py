"""Small set of tunable constants (meters)."""
EARTH_RADIUS: int = 6_371_000
INTERCHANGE_DISTANCE: int = 100
TRANSFER_PENALTY: int = 3000

# How strongly the Dijkstra transfer-search fallback (find_shortest_path
# with avoid_congestion=True) penalizes a "ride" edge in proportion to
# its recorded congestion_ratio. A ride edge's weight becomes
#     distance_m * (1 + CONGESTION_LAMBDA * max(congestion_ratio - 1, 0))
# so free-flow edges (ratio ~= 1) are untouched and only genuinely
# congested edges get inflated. Starting value, tune by hand against a
# few known-congested corridors (Koteshwor, Kalanki, Thapathali) before
# trusting it in production.
CONGESTION_LAMBDA: float = 0.75
