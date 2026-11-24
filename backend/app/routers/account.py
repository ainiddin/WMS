from fastapi import APIRouter

from app.core.deps import DB, CurrentCustomer
from app.schemas.accounts import AccountOut, TransactionOut
from app.services import account_service, payment_gateway

router = APIRouter(prefix="/api/account", tags=["account"])


def _out(db, customer_id: int) -> AccountOut:
    account = account_service.get_account(db, customer_id)
    return AccountOut(
        code=account.code,
        balance=account.balance,
        gateway=payment_gateway.NAME,
        transactions=[TransactionOut.from_tx(t) for t in account_service.history(db, account)],
    )


@router.get("/", response_model=AccountOut)
def my_account(db: DB, customer: CurrentCustomer):
    """Balance and the last 100 operations of the signed-in customer. Top-ups: POST /api/payments/top-up/."""
    out = _out(db, customer.id)
    db.commit()  # an account created on first use is saved
    return out
