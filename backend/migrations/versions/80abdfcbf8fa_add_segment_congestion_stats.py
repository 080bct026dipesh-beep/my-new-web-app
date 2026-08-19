"""add segment_congestion_stats table

Revision ID: 80abdfcbf8fa
Revises: 2f29b3e3e5fd
Create Date: 2026-08-19 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '80abdfcbf8fa'
down_revision: Union[str, None] = '2f29b3e3e5fd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'segment_congestion_stats',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('route_id', sa.Text(), nullable=True),
        sa.Column('from_stop_id', sa.Text(), nullable=False),
        sa.Column('to_stop_id', sa.Text(), nullable=False),
        sa.Column('day_of_week', sa.SmallInteger(), nullable=False),
        sa.Column('hour_bucket', sa.SmallInteger(), nullable=False),
        sa.Column('avg_duration_s', sa.Float(), nullable=False),
        sa.Column('avg_distance_m', sa.Float(), nullable=False),
        sa.Column('sample_count', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('is_seeded', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column(
            'updated_at',
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text('now()'),
        ),
        sa.ForeignKeyConstraint(['route_id'], ['routes.route_id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['from_stop_id'], ['stops.stop_id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['to_stop_id'], ['stops.stop_id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint('day_of_week BETWEEN 0 AND 6', name='ck_congestion_day_of_week'),
        sa.CheckConstraint(
            'hour_bucket IN (0,3,6,9,12,15,18,21)', name='ck_congestion_hour_bucket'
        ),
        sa.CheckConstraint('sample_count >= 0', name='ck_congestion_sample_count'),
        sa.UniqueConstraint(
            'route_id',
            'from_stop_id',
            'to_stop_id',
            'day_of_week',
            'hour_bucket',
            name='uq_segment_congestion_key',
        ),
    )
    op.create_index(
        'idx_congestion_day_hour',
        'segment_congestion_stats',
        ['day_of_week', 'hour_bucket'],
    )


def downgrade() -> None:
    op.drop_index('idx_congestion_day_hour', table_name='segment_congestion_stats')
    op.drop_table('segment_congestion_stats')
