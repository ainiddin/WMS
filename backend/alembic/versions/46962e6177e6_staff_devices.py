"""staff devices: staff sign in only from approved phones

Revision ID: 46962e6177e6
Revises: a76ef0d462f1
Create Date: 2026-11-12 16:39:14.603689

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '46962e6177e6'
down_revision: Union[str, Sequence[str], None] = 'a76ef0d462f1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('staff_devices',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('secret_hash', sa.String(length=64), nullable=False),
    sa.Column('device_name', sa.String(length=100), nullable=False),
    sa.Column('status', sa.String(length=10), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('approved_by_id', sa.Integer(), nullable=True),
    sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=True),
    sa.CheckConstraint("status IN ('PENDING', 'APPROVED', 'REVOKED')", name='chk_staff_devices_status'),
    sa.ForeignKeyConstraint(['approved_by_id'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id', 'secret_hash', name='uq_staff_devices_user_secret')
    )
    op.create_index(op.f('ix_staff_devices_user_id'), 'staff_devices', ['user_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_staff_devices_user_id'), table_name='staff_devices')
    op.drop_table('staff_devices')
