from datetime import datetime
from decimal import Decimal

from sqlalchemy import DDL, CheckConstraint, DateTime, ForeignKey, Numeric, String, UniqueConstraint, event
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.common import PaymentStatus, TransactionType, code_column, created_at_column, in_check
from app.models.people import Customer


class Account(Base):
    """The customer's money in the shop (KZT). Topped up by card through CardPay Fake, spent on orders.

    PostgreSQL guards it (see LEDGER_SQL): the balance never goes below zero and changes ONLY by a new row in
    account_transactions; a direct UPDATE of the balance is refused. No card data is kept here.
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


class Payment(Base):
    """One top-up by card through the gateway: PENDING until the gateway's signed webhook says how it ended.

    Only the brand and last 4 digits come back from the gateway (to show "Visa .. 4242"); the card itself never
    reaches the shop. A finished payment never changes and no payment is ever deleted (PAYMENTS_SQL).
    """

    __tablename__ = "payments"
    __table_args__ = (
        CheckConstraint(in_check("status", PaymentStatus), name="chk_payments_status"),
        CheckConstraint("amount > 0", name="chk_payments_amount"),
        CheckConstraint("card_last4 IS NULL OR card_last4 ~ '^[0-9]{4}$'", name="chk_payments_card_last4"),
        CheckConstraint("(status = 'PENDING') = (completed_at IS NULL)", name="chk_payments_completed"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = code_column("PAY", 5)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="RESTRICT"), index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    status: Mapped[str] = mapped_column(String(10), default=PaymentStatus.PENDING)
    card_brand: Mapped[str | None] = mapped_column(String(20))
    card_last4: Mapped[str | None] = mapped_column(String(4))
    gateway_event_id: Mapped[str | None] = mapped_column(String(40))
    failure_reason: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = created_at_column()
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    account: Mapped[Account] = relationship()


class AccountTransaction(Base):
    """Every change of a balance: TOPUP (+, a succeeded card payment), PAYMENT (-, for an order),
    REFUND (+, order cancelled). Append-only; balance_after is set by PostgreSQL (LEDGER_SQL)."""

    __tablename__ = "account_transactions"
    __table_args__ = (
        CheckConstraint(in_check("tx_type", TransactionType), name="chk_account_tx_type"),
        CheckConstraint("amount > 0", name="chk_account_tx_amount"),
        CheckConstraint("balance_after >= 0", name="chk_account_tx_balance_after"),
        CheckConstraint("(tx_type = 'TOPUP') = (order_id IS NULL)", name="chk_account_tx_order"),
        CheckConstraint("(tx_type = 'TOPUP') = (payment_id IS NOT NULL)", name="chk_account_tx_payment"),
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
    # A payment is credited at most once.
    payment_id: Mapped[int | None] = mapped_column(ForeignKey("payments.id", ondelete="RESTRICT"), unique=True)
    note: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = created_at_column()

    account: Mapped[Account] = relationship(back_populates="transactions")
    order: Mapped["Order | None"] = relationship(back_populates="transactions")  # noqa: F821
    payment: Mapped[Payment | None] = relationship()


# ---- Rules PostgreSQL enforces itself, so nobody with access to the database (as the app's user) can
# "print money": the balance moves only together with a ledger row, and a top-up needs a succeeded payment.
# (The owner/superuser of the database can still disable triggers; that is outside what a table can guard.)
LEDGER_SQL = """
CREATE OR REPLACE FUNCTION account_tx_post() RETURNS trigger AS $$
DECLARE
    current_balance numeric;
    pay record;
    paid numeric;
BEGIN
    SELECT balance INTO current_balance FROM accounts WHERE id = NEW.account_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'no such account' USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF NEW.tx_type = 'TOPUP' THEN
        SELECT account_id, amount, status INTO pay FROM payments WHERE id = NEW.payment_id;
        IF NOT FOUND OR pay.status <> 'SUCCEEDED' OR pay.account_id <> NEW.account_id OR pay.amount <> NEW.amount THEN
            RAISE EXCEPTION 'a top-up needs a succeeded payment of the same account and amount'
                USING ERRCODE = 'check_violation';
        END IF;
        NEW.balance_after := current_balance + NEW.amount;
    ELSIF NEW.tx_type = 'REFUND' THEN
        SELECT amount INTO paid FROM account_transactions
         WHERE order_id = NEW.order_id AND tx_type = 'PAYMENT' AND account_id = NEW.account_id;
        IF NOT FOUND OR paid <> NEW.amount THEN
            RAISE EXCEPTION 'a refund needs a payment of the same order and amount' USING ERRCODE = 'check_violation';
        END IF;
        NEW.balance_after := current_balance + NEW.amount;
    ELSE
        NEW.balance_after := current_balance - NEW.amount;
    END IF;
    UPDATE accounts SET balance = NEW.balance_after WHERE id = NEW.account_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_account_tx_post BEFORE INSERT ON account_transactions
    FOR EACH ROW EXECUTE FUNCTION account_tx_post();

CREATE OR REPLACE FUNCTION account_tx_append_only() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'account_transactions is append-only' USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_account_tx_append_only BEFORE UPDATE OR DELETE ON account_transactions
    FOR EACH ROW EXECUTE FUNCTION account_tx_append_only();
"""

BALANCE_GUARD_SQL = """
CREATE OR REPLACE FUNCTION accounts_balance_guard() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.balance <> 0 THEN
            RAISE EXCEPTION 'a new account starts with 0' USING ERRCODE = 'check_violation';
        END IF;
    -- Depth 2 = the UPDATE made by account_tx_post while a ledger row is inserted; depth 1 = anyone else.
    ELSIF NEW.balance IS DISTINCT FROM OLD.balance AND pg_trigger_depth() < 2 THEN
        RAISE EXCEPTION 'the balance changes only through account_transactions' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_accounts_balance_guard BEFORE INSERT OR UPDATE ON accounts
    FOR EACH ROW EXECUTE FUNCTION accounts_balance_guard();
"""

PAYMENTS_SQL = """
CREATE OR REPLACE FUNCTION payments_guard() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'payments are never deleted' USING ERRCODE = 'check_violation';
    ELSIF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'PENDING' THEN
            RAISE EXCEPTION 'a payment starts as PENDING' USING ERRCODE = 'check_violation';
        END IF;
    ELSE
        IF OLD.status <> 'PENDING' THEN
            RAISE EXCEPTION 'a finished payment never changes' USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.amount <> OLD.amount OR NEW.account_id <> OLD.account_id OR NEW.created_at <> OLD.created_at THEN
            RAISE EXCEPTION 'the amount and account of a payment never change' USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_payments_guard BEFORE INSERT OR UPDATE OR DELETE ON payments
    FOR EACH ROW EXECUTE FUNCTION payments_guard();
"""

# Tests build the schema with create_all, so the triggers are attached to the tables, not only to the migration.
event.listen(Account.__table__, "after_create", DDL(BALANCE_GUARD_SQL))
event.listen(Payment.__table__, "after_create", DDL(PAYMENTS_SQL))
event.listen(AccountTransaction.__table__, "after_create", DDL(LEDGER_SQL))
