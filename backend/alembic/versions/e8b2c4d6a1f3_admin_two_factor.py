"""admin two-factor sign in: email code challenges, verified admin phones

Revision ID: e8b2c4d6a1f3
Revises: d3a1f0c2b9e4
Create Date: 2026-11-18 14:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'e8b2c4d6a1f3'
down_revision: Union[str, Sequence[str], None] = 'd3a1f0c2b9e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('two_factor_challenges',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('token_hash', sa.String(length=64), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('channel', sa.String(length=10), nullable=False),
    sa.Column('device_id', sa.Integer(), nullable=True),
    sa.Column('ip', sa.String(length=45), nullable=True),
    sa.Column('code_hash', sa.String(length=100), nullable=False),
    sa.Column('code_sent_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('attempts', sa.Integer(), server_default='0', nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("channel IN ('WEB', 'DEVICE')", name='chk_two_factor_channel'),
    sa.ForeignKeyConstraint(['device_id'], ['staff_devices.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('token_hash')
    )
    op.create_index(op.f('ix_two_factor_challenges_user_id'), 'two_factor_challenges', ['user_id'], unique=False)
    op.add_column('staff_devices', sa.Column('two_factor_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('staff_devices', 'two_factor_at')
    op.drop_index(op.f('ix_two_factor_challenges_user_id'), table_name='two_factor_challenges')
    op.drop_table('two_factor_challenges')
