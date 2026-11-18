"""users.password_changed_at: admin password expiry and sign out of old sessions

Revision ID: f1c3e5a7b9d2
Revises: e8b2c4d6a1f3
Create Date: 2026-11-18 16:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'f1c3e5a7b9d2'
down_revision: Union[str, Sequence[str], None] = 'e8b2c4d6a1f3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Existing accounts count from the moment of this migration (their old tokens keep working:
    # they were issued before, so iat < password_changed_at would sign everybody out -> use the epoch).
    op.add_column('users', sa.Column('password_changed_at', sa.DateTime(timezone=True),
                                     server_default=sa.text("'1970-01-01 00:00:00+00'"), nullable=False))
    op.execute("UPDATE users SET password_changed_at = date_trunc('second', now()) WHERE role = 'ADMIN'")
    op.alter_column('users', 'password_changed_at', server_default=sa.text('now()'))


def downgrade() -> None:
    op.drop_column('users', 'password_changed_at')
