"""card top-ups through the gateway (payments), balance only through the ledger, no saved card

- payments: one row per top-up by card (PENDING -> SUCCEEDED / FAILED / EXPIRED), finished rows never change;
- account_transactions.payment_id: every TOPUP points to a succeeded payment, credited once;
  old top-ups get a SUCCEEDED payment each (no card data: they came from the old simulated bank);
- triggers: the ledger is append-only and the only way the balance moves;
- accounts loses the saved card (the full number must never reach the shop).

Revision ID: a7c9e1b3d5f6
Revises: c9d1e3f5a7b2
Create Date: 2026-11-24 12:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.models.accounts import BALANCE_GUARD_SQL, LEDGER_SQL, PAYMENTS_SQL

revision: str = 'a7c9e1b3d5f6'
down_revision: Union[str, Sequence[str], None] = 'c9d1e3f5a7b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'payments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('code', sa.String(length=20),
                  sa.Computed("'PAY' || lpad(id::text, greatest(5, length(id::text)), '0')", persisted=True),
                  nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('amount', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('status', sa.String(length=10), nullable=False),
        sa.Column('card_brand', sa.String(length=20), nullable=True),
        sa.Column('card_last4', sa.String(length=4), nullable=True),
        sa.Column('gateway_event_id', sa.String(length=40), nullable=True),
        sa.Column('failure_reason', sa.String(length=200), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("status IN ('PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED')", name='chk_payments_status'),
        sa.CheckConstraint('amount > 0', name='chk_payments_amount'),
        sa.CheckConstraint("card_last4 IS NULL OR card_last4 ~ '^[0-9]{4}$'", name='chk_payments_card_last4'),
        sa.CheckConstraint("(status = 'PENDING') = (completed_at IS NULL)", name='chk_payments_completed'),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('code'),
    )
    op.create_index(op.f('ix_payments_account_id'), 'payments', ['account_id'], unique=False)

    op.add_column('account_transactions', sa.Column('payment_id', sa.Integer(), nullable=True))
    op.create_foreign_key('account_transactions_payment_id_fkey', 'account_transactions', 'payments',
                          ['payment_id'], ['id'], ondelete='RESTRICT')
    op.create_unique_constraint('account_transactions_payment_id_key', 'account_transactions', ['payment_id'])

    # Old top-ups (simulated bank): one succeeded payment each, so every TOPUP has its payment.
    conn = op.get_bind()
    old = conn.execute(sa.text(
        "SELECT id, account_id, amount, created_at FROM account_transactions WHERE tx_type = 'TOPUP' ORDER BY id"
    )).all()
    for tx_id, account_id, amount, created_at in old:
        payment_id = conn.execute(sa.text(
            "INSERT INTO payments (account_id, amount, status, created_at, expires_at, completed_at, failure_reason)"
            " VALUES (:a, :m, 'SUCCEEDED', :t, :t, :t, NULL) RETURNING id"),
            {"a": account_id, "m": amount, "t": created_at}).scalar_one()
        conn.execute(sa.text("UPDATE account_transactions SET payment_id = :p WHERE id = :i"),
                     {"p": payment_id, "i": tx_id})
    op.create_check_constraint('chk_account_tx_payment', 'account_transactions',
                               "(tx_type = 'TOPUP') = (payment_id IS NOT NULL)")

    op.drop_constraint('chk_accounts_card_exp_month', 'accounts', type_='check')
    op.drop_constraint('chk_accounts_card_last4', 'accounts', type_='check')
    for column in ('card_exp_year', 'card_exp_month', 'card_last4', 'card_brand', 'card_holder'):
        op.drop_column('accounts', column)

    op.execute(BALANCE_GUARD_SQL)
    op.execute(PAYMENTS_SQL)
    op.execute(LEDGER_SQL)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_account_tx_append_only ON account_transactions")
    op.execute("DROP TRIGGER IF EXISTS trg_account_tx_post ON account_transactions")
    op.execute("DROP TRIGGER IF EXISTS trg_payments_guard ON payments")
    op.execute("DROP TRIGGER IF EXISTS trg_accounts_balance_guard ON accounts")
    for fn in ('account_tx_append_only', 'account_tx_post', 'payments_guard', 'accounts_balance_guard'):
        op.execute(f"DROP FUNCTION IF EXISTS {fn}()")

    op.add_column('accounts', sa.Column('card_holder', sa.String(length=100), nullable=True))
    op.add_column('accounts', sa.Column('card_brand', sa.String(length=20), nullable=True))
    op.add_column('accounts', sa.Column('card_last4', sa.String(length=4), nullable=True))
    op.add_column('accounts', sa.Column('card_exp_month', sa.SmallInteger(), nullable=True))
    op.add_column('accounts', sa.Column('card_exp_year', sa.SmallInteger(), nullable=True))
    op.create_check_constraint('chk_accounts_card_last4', 'accounts', "card_last4 IS NULL OR card_last4 ~ '^[0-9]{4}$'")
    op.create_check_constraint('chk_accounts_card_exp_month', 'accounts',
                               'card_exp_month IS NULL OR card_exp_month BETWEEN 1 AND 12')

    op.drop_constraint('chk_account_tx_payment', 'account_transactions', type_='check')
    op.drop_constraint('account_transactions_payment_id_key', 'account_transactions', type_='unique')
    op.drop_constraint('account_transactions_payment_id_fkey', 'account_transactions', type_='foreignkey')
    op.drop_column('account_transactions', 'payment_id')
    op.drop_index(op.f('ix_payments_account_id'), table_name='payments')
    op.drop_table('payments')
