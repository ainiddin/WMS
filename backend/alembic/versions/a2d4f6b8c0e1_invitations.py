"""invitations: Managers invite staff by email; no more staff self sign up

Revision ID: a2d4f6b8c0e1
Revises: f1c3e5a7b9d2
Create Date: 2026-11-18 20:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'a2d4f6b8c0e1'
down_revision: Union[str, Sequence[str], None] = 'f1c3e5a7b9d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

OPEN = sa.text('accepted_at IS NULL AND revoked_at IS NULL')


def upgrade() -> None:
    op.create_table('invitations',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('email', sa.String(length=254), nullable=False),
    sa.Column('full_name', sa.String(length=100), nullable=False),
    sa.Column('role', sa.String(length=10), nullable=False),
    sa.Column('team_manager_id', sa.Integer(), nullable=True),
    sa.Column('invited_by_id', sa.Integer(), nullable=False),
    sa.Column('code_hash', sa.String(length=100), nullable=False),
    sa.Column('code_sent_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('attempts', sa.Integer(), server_default='0', nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('accepted_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('accepted_user_id', sa.Integer(), nullable=True),
    sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('revoked_by_id', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("role IN ('MANAGER', 'WORKER')", name='chk_invitations_role'),
    sa.CheckConstraint('email = lower(email)', name='chk_invitations_email_lower'),
    sa.CheckConstraint("(role = 'WORKER') = (team_manager_id IS NOT NULL)", name='chk_invitations_team'),
    sa.ForeignKeyConstraint(['accepted_user_id'], ['users.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['invited_by_id'], ['users.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['revoked_by_id'], ['users.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['team_manager_id'], ['employees.id'], ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_invitations_email'), 'invitations', ['email'], unique=False)
    op.create_index(op.f('ix_invitations_invited_by_id'), 'invitations', ['invited_by_id'], unique=False)
    op.create_index(op.f('ix_invitations_team_manager_id'), 'invitations', ['team_manager_id'], unique=False)
    op.create_index('uq_invitations_open_email', 'invitations', ['email'], unique=True, postgresql_where=OPEN)


def downgrade() -> None:
    op.drop_index('uq_invitations_open_email', table_name='invitations', postgresql_where=OPEN)
    op.drop_index(op.f('ix_invitations_team_manager_id'), table_name='invitations')
    op.drop_index(op.f('ix_invitations_invited_by_id'), table_name='invitations')
    op.drop_index(op.f('ix_invitations_email'), table_name='invitations')
    op.drop_table('invitations')
