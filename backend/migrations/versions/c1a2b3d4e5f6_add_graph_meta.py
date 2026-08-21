"""add graph_meta table (cross-process routing-graph cache invalidation)

Revision ID: c1a2b3d4e5f6
Revises: b3c9d1e4c6a7
Create Date: 2026-08-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c1a2b3d4e5f6'
down_revision: Union[str, None] = 'b3c9d1e4c6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'graph_meta',
        sa.Column('id', sa.SmallInteger(), nullable=False),
        sa.Column('version', sa.Integer(), nullable=False, server_default=sa.text('1')),
        sa.CheckConstraint('id = 1', name='ck_graph_meta_singleton'),
        sa.PrimaryKeyConstraint('id'),
    )
    # Seed the one row every read/write in app/db/queries.py assumes exists.
    op.execute("INSERT INTO graph_meta (id, version) VALUES (1, 1)")


def downgrade() -> None:
    op.drop_table('graph_meta')
