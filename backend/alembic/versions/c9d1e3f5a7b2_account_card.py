"""account card: the customer's saved bank card (holder, brand, last 4 digits, expiry; never the full number or CVV)

Revision ID: c9d1e3f5a7b2
Revises: b3e5c7d9f1a2
Create Date: 2026-11-19 18:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'c9d1e3f5a7b2'
down_revision: Union[str, Sequence[str], None] = 'b3e5c7d9f1a2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('accounts', sa.Column('card_holder', sa.String(length=100), nullable=True))
    op.add_column('accounts', sa.Column('card_brand', sa.String(length=20), nullable=True))
    op.add_column('accounts', sa.Column('card_last4', sa.String(length=4), nullable=True))
    op.add_column('accounts', sa.Column('card_exp_month', sa.SmallInteger(), nullable=True))
    op.add_column('accounts', sa.Column('card_exp_year', sa.SmallInteger(), nullable=True))
    op.create_check_constraint('chk_accounts_card_last4', 'accounts', "card_last4 IS NULL OR card_last4 ~ '^[0-9]{4}$'")
    op.create_check_constraint('chk_accounts_card_exp_month', 'accounts',
                               'card_exp_month IS NULL OR card_exp_month BETWEEN 1 AND 12')


def downgrade() -> None:
    op.drop_constraint('chk_accounts_card_exp_month', 'accounts', type_='check')
    op.drop_constraint('chk_accounts_card_last4', 'accounts', type_='check')
    for column in ('card_exp_year', 'card_exp_month', 'card_last4', 'card_brand', 'card_holder'):
        op.drop_column('accounts', column)
