from fastapi import APIRouter, status

from app.core.deps import DB, CurrentCustomer
from app.schemas.accounts import AccountOut, TopUpRequest, TransactionOut
from app.services import account_service

router = APIRouter(prefix="/api/account", tags=["account"])


def _out(db, customer_id: int) -> AccountOut:
    account = account_service.get_account(db, customer_id)
    return AccountOut(
        code=account.code,
        balance=account.balance,
        bank=account_service.DEMO_BANK,
        transactions=[TransactionOut.from_tx(t) for t in account_service.history(db, account)],
    )


@router.get("/", response_model=AccountOut)
def my_account(db: DB, customer: CurrentCustomer):
    """Balance and the last 100 operations of the signed-in customer."""
    out = _out(db, customer.id)
    db.commit()  # an account created on first use is saved
    return out


@router.post("/top-up/", response_model=AccountOut, status_code=status.HTTP_201_CREATED)
def top_up(data: TopUpRequest, db: DB, customer: CurrentCustomer):
    """Simulated bank transfer: the money is added at once. No real money and no card data are involved."""
    account_service.top_up(db, customer, data.amount)
    db.commit()
    return _out(db, customer.id)
