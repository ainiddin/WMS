from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.common import TransactionType, code_column, created_at_column, in_check
from app.models.people import Customer


class Account(Base):
    """The customer's money in the shop (KZT). Topped up from a bank (simulated), spent on orders.

    The balance can never go below zero: PostgreSQL itself refuses it.
    """

    __tablename__ = "accounts"
    __table_args__ = (CheckConstraint("balance >= 0", name="chk_accounts_balance"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = code_column("A", 4)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id", ondelete="RESTRICT"), unique=True)
    balance: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"), server_default="0")
    created_at: Mapped[datetime] = created_at_column()

    customer: Mapped[Customer] = relationship(back_populates="account")
    transactions: Mapped[list["AccountTransaction"]] = relationship(back_populates="account")


class AccountTransaction(Base):
    """Every change of a balance: TOPUP (+, from the bank), PAYMENT (-, for an order), REFUND (+, order cancelled)."""

    __tablename__ = "account_transactions"
    __table_args__ = (
        CheckConstraint(in_check("tx_type", TransactionType), name="chk_account_tx_type"),
        CheckConstraint("amount > 0", name="chk_account_tx_amount"),
        CheckConstraint("balance_after >= 0", name="chk_account_tx_balance_after"),
        CheckConstraint("(tx_type = 'TOPUP') = (order_id IS NULL)", name="chk_account_tx_order"),
        # An order is paid at most once and refunded at most once.
        UniqueConstraint("order_id", "tx_type", name="uq_account_tx_order_type"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = code_column("T", 5)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="RESTRICT"), index=True)
    tx_type: Mapped[str] = mapped_column(String(10))
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    balance_after: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="RESTRICT"), index=True)
    note: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = created_at_column()

    account: Mapped[Account] = relationship(back_populates="transactions")
    order: Mapped["Order | None"] = relationship(back_populates="transactions")  # noqa: F821
