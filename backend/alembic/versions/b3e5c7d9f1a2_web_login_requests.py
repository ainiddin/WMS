"""web login requests: website sign in approved on the phone (Steam Guard style)

Revision ID: b3e5c7d9f1a2
Revises: a2d4f6b8c0e1
Create Date: 2026-11-19 12:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'b3e5c7d9f1a2'
down_revision: Union[str, Sequence[str], None] = 'a2d4f6b8c0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('web_login_requests',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('token_hash', sa.String(length=64), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('number', sa.Integer(), nullable=False),
    sa.Column('choices', sa.String(length=20), nullable=False),
    sa.Column('status', sa.String(length=10), server_default='PENDING', nullable=False),
    sa.Column('ip', sa.String(length=45), nullable=True),
    sa.Column('user_agent', sa.String(length=200), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('decided_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('decided_device_id', sa.Integer(), nullable=True),
    sa.CheckConstraint("status IN ('PENDING', 'APPROVED', 'DENIED', 'USED', 'CLOSED')", name='chk_web_login_status'),
    sa.CheckConstraint('number BETWEEN 10 AND 99', name='chk_web_login_number'),
    sa.ForeignKeyConstraint(['decided_device_id'], ['staff_devices.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('token_hash')
    )
    op.create_index(op.f('ix_web_login_requests_user_id'), 'web_login_requests', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_web_login_requests_user_id'), table_name='web_login_requests')
    op.drop_table('web_login_requests')
