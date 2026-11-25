"""invitations become one-time links (token hash, 1 hour); the old email + code invitations are dropped

Old open invitations cannot work any more (they had no link), so the table is created again in the new shape.

Revision ID: b8d0f2a4c6e8
Revises: a7c9e1b3d5f6
Create Date: 2026-11-25 12:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'b8d0f2a4c6e8'
down_revision: Union[str, Sequence[str], None] = 'a7c9e1b3d5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _common_columns():
    return [
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('role', sa.String(length=10), nullable=False),
        sa.Column('team_manager_id', sa.Integer(), nullable=True),
        sa.Column('invited_by_id', sa.Integer(), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('accepted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('accepted_user_id', sa.Integer(), nullable=True),
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('revoked_by_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint("role IN ('MANAGER', 'WORKER')", name='chk_invitations_role'),
        sa.CheckConstraint("(role = 'WORKER') = (team_manager_id IS NOT NULL)", name='chk_invitations_team'),
        sa.ForeignKeyConstraint(['accepted_user_id'], ['users.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['invited_by_id'], ['users.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['revoked_by_id'], ['users.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['team_manager_id'], ['employees.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id'),
    ]


def upgrade() -> None:
    op.drop_table('invitations')  # drops its indexes too
    op.create_table(
        'invitations',
        *_common_columns(),
        sa.Column('token_hash', sa.String(length=64), nullable=False),
        sa.CheckConstraint("(accepted_at IS NULL) = (accepted_user_id IS NULL)", name='chk_invitations_accepted'),
        sa.UniqueConstraint('token_hash'),
    )
    op.create_index(op.f('ix_invitations_invited_by_id'), 'invitations', ['invited_by_id'], unique=False)
    op.create_index(op.f('ix_invitations_team_manager_id'), 'invitations', ['team_manager_id'], unique=False)


def downgrade() -> None:
    # The old shape comes back empty: links cannot be turned into email + code invitations.
    op.drop_table('invitations')
    open_rows = sa.text("accepted_at IS NULL AND revoked_at IS NULL")
    op.create_table(
        'invitations',
        *_common_columns(),
        sa.Column('email', sa.String(length=254), nullable=False),
        sa.Column('full_name', sa.String(length=100), nullable=False),
        sa.Column('code_hash', sa.String(length=100), nullable=False),
        sa.Column('code_sent_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('attempts', sa.Integer(), server_default='0', nullable=False),
        sa.CheckConstraint('email = lower(email)', name='chk_invitations_email_lower'),
    )
    op.create_index(op.f('ix_invitations_email'), 'invitations', ['email'], unique=False)
    op.create_index(op.f('ix_invitations_invited_by_id'), 'invitations', ['invited_by_id'], unique=False)
    op.create_index(op.f('ix_invitations_team_manager_id'), 'invitations', ['team_manager_id'], unique=False)
    op.create_index('uq_invitations_open_email', 'invitations', ['email'], unique=True, postgresql_where=open_rows)
