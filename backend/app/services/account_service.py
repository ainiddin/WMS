"""Customer accounts: top up from a bank (simulated, no real money), pay for orders, refunds.

Functions change the session but do not commit; the router commits once.
"""

from datetime import datetime
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Account, AccountTransaction, Customer, Order, TransactionType
from app.models.common import utcnow

DEMO_BANK = "KeyFive Demo Bank"
MAX_BALANCE = Decimal("10000000")


def get_account(db: Session, customer_id: int, *, lock: bool = False) -> Account:
    """The customer's account; locked rows make two payments at the same moment wait for each other."""
    stmt = select(Account).where(Account.customer_id == customer_id)
    if lock:
        stmt = stmt.with_for_update()
    account = db.scalars(stmt).one_or_none()
    if account is None:  # customers created before accounts existed get one on first use
        account = Account(customer_id=customer_id, balance=Decimal("0"))
        db.add(account)
        db.flush()
    return account


def _record(db: Session, account: Account, tx_type: TransactionType, amount: Decimal,
            order: Order | None, note: str, at: datetime | None) -> AccountTransaction:
    account.balance += amount if tx_type != TransactionType.PAYMENT else -amount
    tx = AccountTransaction(account_id=account.id, tx_type=tx_type, amount=amount, balance_after=account.balance,
                            order_id=order.id if order else None, note=note, created_at=at or utcnow())
    db.add(tx)
    db.flush()
    return tx


def top_up(db: Session, customer: Customer, amount: Decimal, at: datetime | None = None) -> AccountTransaction:
    """Money "arrives" from the demo bank at once. In a real shop this would be a payment provider callback."""
    account = get_account(db, customer.id, lock=True)
    if account.balance + amount > MAX_BALANCE:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            f"The balance cannot be more than {MAX_BALANCE:,.0f} KZT".replace(",", " "))
    return _record(db, account, TransactionType.TOPUP, amount, None, f"Top-up from {DEMO_BANK}", at)


def pay_order(db: Session, order: Order, at: datetime | None = None) -> AccountTransaction:
    account = get_account(db, order.customer_id, lock=True)
    if account.balance < order.total_amount:
        missing = order.total_amount - account.balance
        raise HTTPException(
            status.HTTP_402_PAYMENT_REQUIRED,
            f"Not enough money on your account: balance {account.balance:,.0f} KZT, order {order.total_amount:,.0f} KZT. "
            f"Top up at least {missing:,.0f} KZT".replace(",", " "),
        )
    return _record(db, account, TransactionType.PAYMENT, order.total_amount, order, f"Payment for order {order.code}", at)


def refund_order(db: Session, order: Order, at: datetime | None = None) -> AccountTransaction | None:
    """Gives the money back when a paid order is rejected or cancelled. Orders paid on delivery have nothing to refund."""
    paid = db.scalar(select(AccountTransaction).where(AccountTransaction.order_id == order.id,
                                                      AccountTransaction.tx_type == TransactionType.PAYMENT))
    if paid is None:
        return None
    account = get_account(db, order.customer_id, lock=True)
    return _record(db, account, TransactionType.REFUND, paid.amount, order, f"Refund for order {order.code}", at)


def history(db: Session, account: Account, limit: int = 100) -> list[AccountTransaction]:
    stmt = (select(AccountTransaction).where(AccountTransaction.account_id == account.id)
            .order_by(AccountTransaction.created_at.desc(), AccountTransaction.id.desc()).limit(limit))
    return list(db.scalars(stmt).all())
