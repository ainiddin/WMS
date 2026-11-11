"""customer accounts: balance + operations (top-up, payment, refund)

Revision ID: f57491a55874
Revises: c41e5a7d9f20
Create Date: 2026-11-11 13:11:18.847378

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f57491a55874'
down_revision: Union[str, Sequence[str], None] = 'c41e5a7d9f20'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('accounts',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('code', sa.String(length=20), sa.Computed("'A' || lpad(id::text, greatest(4, length(id::text)), '0')", persisted=True), nullable=False),
    sa.Column('customer_id', sa.Integer(), nullable=False),
    sa.Column('balance', sa.Numeric(precision=14, scale=2), server_default='0', nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('balance >= 0', name='chk_accounts_balance'),
    sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('code'),
    sa.UniqueConstraint('customer_id')
    )
    op.create_table('account_transactions',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('code', sa.String(length=20), sa.Computed("'T' || lpad(id::text, greatest(5, length(id::text)), '0')", persisted=True), nullable=False),
    sa.Column('account_id', sa.Integer(), nullable=False),
    sa.Column('tx_type', sa.String(length=10), nullable=False),
    sa.Column('amount', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('balance_after', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('order_id', sa.Integer(), nullable=True),
    sa.Column('note', sa.String(length=255), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("(tx_type = 'TOPUP') = (order_id IS NULL)", name='chk_account_tx_order'),
    sa.CheckConstraint("tx_type IN ('TOPUP', 'PAYMENT', 'REFUND')", name='chk_account_tx_type'),
    sa.CheckConstraint('amount > 0', name='chk_account_tx_amount'),
    sa.CheckConstraint('balance_after >= 0', name='chk_account_tx_balance_after'),
    sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['order_id'], ['orders.id'], ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('code'),
    sa.UniqueConstraint('order_id', 'tx_type', name='uq_account_tx_order_type')
    )
    op.create_index(op.f('ix_account_transactions_account_id'), 'account_transactions', ['account_id'], unique=False)
    op.create_index(op.f('ix_account_transactions_order_id'), 'account_transactions', ['order_id'], unique=False)
    # Every existing customer gets an empty account. Their old orders were paid on delivery.
    op.execute("INSERT INTO accounts (customer_id) SELECT id FROM customers ORDER BY id")


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_account_transactions_order_id'), table_name='account_transactions')
    op.drop_index(op.f('ix_account_transactions_account_id'), table_name='account_transactions')
    op.drop_table('account_transactions')
    op.drop_table('accounts')
