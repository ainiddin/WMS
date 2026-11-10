"""email verification codes for sign up

Revision ID: c41e5a7d9f20
Revises: b7c8b3b9a417
Create Date: 2026-11-05 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c41e5a7d9f20'
down_revision: Union[str, Sequence[str], None] = 'b7c8b3b9a417'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('email_verifications',
    sa.Column('email', sa.String(length=254), nullable=False),
    sa.Column('code_hash', sa.String(length=100), nullable=False),
    sa.Column('attempts', sa.Integer(), server_default='0', nullable=False),
    sa.Column('sent_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('email')
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('email_verifications')
