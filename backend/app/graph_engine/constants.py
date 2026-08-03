"""
constants.py

Every fixed value the graph engine depends on lives here, in one place,
so nothing is silently hardcoded inside logic files. If you need to
retune anything (Phase 7), this is the only file you should have to
touch.
"""

# Earth's radius in meters -- used by the haversine distance formula
EARTH_RADIUS = 6371000

# How far apart (in meters) two stops on DIFFERENT routes can be and
# still be treated as "the same real-world interchange location."
# Real field-collected stop pins for the same physical stop rarely
# land on the exact same coordinate -- this tolerance accounts for that.
#
# Placeholder value: tune this in Phase 7 based on how far apart two
# real interchange stops actually are in Kathmandu (e.g. measure the
# Ratnapark or Koteshwor interchange yourself).
INTERCHANGE_DISTANCE = 100

# The "cost" of making a transfer, expressed in the same unit as
# distance (meters), added on top of the physical distance between the
# two interchange stops. This is what makes Dijkstra prefer a direct
# route over a transfer route unless the transfer is genuinely faster.
#
# Placeholder value: tune this in Phase 7. A reasonable way to pick it:
# estimate the real walk + wait time for a transfer you've personally
# made (e.g. 6-8 minutes), and convert that to an equivalent distance
# at typical bus speed. Document your reasoning once you settle on a
# number -- evaluators will ask why you chose it.
TRANSFER_PENALTY = 900