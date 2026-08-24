"""add osrm_distance_km to routes

approx_distance_km comes from the source dataset (user-supplied /
crowdsourced) and haversine_distance_km is a straight-line estimate --
neither reflects the actual road distance a bus travels. This adds a
column for the real OSRM-computed road distance over each route's full
ordered stop sequence, populated by
backend/scripts/compute_osrm_route_distances.py against a live OSRM
instance. Nullable + additive: existing approx/haversine columns are
left in place as fallbacks for routes not yet (re)computed.

Revision ID: 9d3f1a7c2b4e
Revises: 38a5d0f89268
Create Date: 2026-08-23 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9d3f1a7c2b4e'
down_revision: Union[str, None] = '38a5d0f89268'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'routes',
        sa.Column('osrm_distance_km', sa.Numeric(6, 2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('routes', 'osrm_distance_km')
