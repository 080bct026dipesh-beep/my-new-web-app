"""fix admin_users.created_at type to match other tables

admin_users.created_at was created as a naive DateTime with a Python-side
default (datetime.utcnow) -- the one column in the schema that didn't
follow the TIMESTAMP(timezone=True) + server_default now() pattern every
other table's created_at/updated_at uses (routes, stops,
segment_congestion_stats). This brings it in line.

USING ... AT TIME ZONE 'UTC' on the ALTER is correct here specifically
because every existing value was in fact written as UTC (datetime.utcnow()
with no tzinfo) -- it attaches the correct zone rather than converting.

Revision ID: f56a50612cd8
Revises: 9d3f1a7c2b4e
Create Date: 2026-08-26
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f56a50612cd8'
down_revision: Union[str, None] = '9d3f1a7c2b4e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        'admin_users',
        'created_at',
        type_=sa.TIMESTAMP(timezone=True),
        server_default=sa.text('now()'),
        postgresql_using="created_at AT TIME ZONE 'UTC'",
    )


def downgrade() -> None:
    op.alter_column(
        'admin_users',
        'created_at',
        type_=sa.DateTime(),
        server_default=None,
        postgresql_using="created_at AT TIME ZONE 'UTC'",
    )
