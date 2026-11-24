"""Customer accounts: credited by card payments (payment_service), pay for orders, refunds.

Every change is a new row in account_transactions; PostgreSQL moves the balance itself (models.accounts.LEDGER_SQL)
and refuses any other way. Functions change the session but do not commit; the router commits once.
"""

from datetime import datetime
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Account, AccountTransaction, Order, Payment, TransactionType
from app.models.common import utcnow

MAX_BALANCE = Decimal("10000000")


def get_account(db: Session, customer_id: int, *, lock: bool = False) -> Account:
    """The customer's account; locked rows make two payments at the same moment wait for each other."""
    stmt = select(Account).where(Account.customer_id == customer_id)
    if lock:  # and re-read: the balance is changed by PostgreSQL, the object in the session may be old
        stmt = stmt.with_for_update().execution_options(populate_existing=True)
    account = db.scalars(stmt).one_or_none()
    if account is None:  # customers created before accounts existed get one on first use
        account = Account(customer_id=customer_id, balance=Decimal("0"))
        db.add(account)
        db.flush()
    return account


def _record(db: Session, account: Account, tx_type: TransactionType, amount: Decimal, order: Order | None,
            note: str, at: datetime | None, payment: Payment | None = None) -> AccountTransaction:
    """A new ledger row. PostgreSQL sets balance_after and moves the balance in the same statement."""
    tx = AccountTransaction(account_id=account.id, tx_type=tx_type, amount=amount,
                            order_id=order.id if order else None, payment_id=payment.id if payment else None,
                            note=note, created_at=at or utcnow())
    db.add(tx)
    db.flush()
    db.refresh(tx)
    db.refresh(account)
    return tx


def credit_payment(db: Session, payment: Payment, at: datetime | None = None) -> AccountTransaction:
    """A card payment the gateway confirmed (payment_service.handle_webhook). The database checks it succeeded."""
    account = db.scalars(select(Account).where(Account.id == payment.account_id).with_for_update()
                         .execution_options(populate_existing=True)).one()
    card = f"{payment.card_brand} .. {payment.card_last4}" if payment.card_last4 else "card"
    return _record(db, account, TransactionType.TOPUP, payment.amount, None,
                   f"Top-up by {card} ({payment.code}, CardPay Fake)", at, payment)


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
