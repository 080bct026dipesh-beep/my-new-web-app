"""Drop route_return_leg_priority table

Revision ID: b3c9d1e4c6a7
Revises: 80abdfcbf8fa
Create Date: 2026-08-19
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b3c9d1e4c6a7'
down_revision: Union[str, None] = '80abdfcbf8fa'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop the auxiliary QA/tracking table if present
    op.execute("DROP TABLE IF EXISTS route_return_leg_priority CASCADE")


def downgrade() -> None:
    # Recreate the table to restore previous state
    op.create_table(
        'route_return_leg_priority',
        sa.Column('route_id', sa.Text, sa.ForeignKey('routes.route_id', ondelete='CASCADE'), primary_key=True),
        sa.Column('route_name', sa.Text),
        sa.Column('vehicle_type', sa.Text),
        sa.Column('operator', sa.Text),
        sa.Column('total_stops', sa.Integer),
        sa.Column('approx_distance_km', sa.Numeric(6, 2)),
        sa.Column('status', sa.Text),
    )
