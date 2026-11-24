import logging

from fastapi import APIRouter, Request, status
from starlette.concurrency import run_in_threadpool

from app.core.deps import DB, CurrentCustomer
from app.fakepay.signing import SIGNATURE_HEADER
from app.schemas.accounts import PaymentOut, TopUpRequest, TopUpStarted
from app.services import payment_service

log = logging.getLogger("keyfive")
router = APIRouter(prefix="/api/payments", tags=["payments"])


@router.post("/top-up/", response_model=TopUpStarted, status_code=status.HTTP_201_CREATED)
def start_top_up(data: TopUpRequest, db: DB, customer: CurrentCustomer):
    """Opens a payment and returns the gateway's page. The card is typed there, never sent to this API."""
    payment, url = payment_service.start_top_up(db, customer, data.amount)
    db.commit()
    return TopUpStarted(code=payment.code, amount=payment.amount, checkout_url=url, expires_at=payment.expires_at)


@router.get("/{code}/", response_model=PaymentOut)
def payment_status(code: str, db: DB, customer: CurrentCustomer):
    """The site asks this after coming back from the gateway: only the webhook decides the result."""
    payment = payment_service.get_for(db, customer, code)
    db.commit()
    return payment


@router.post("/fakepay/webhook/", include_in_schema=False)
async def fakepay_webhook(request: Request, db: DB):
    """Called by the gateway, not by people: no user token, the signature is the proof."""
    body = await request.body()  # the exact bytes: the signature covers them

    def handle() -> str:  # database work off the event loop
        outcome = payment_service.handle_webhook(db, body, request.headers.get(SIGNATURE_HEADER))
        db.commit()
        return outcome

    result = await run_in_threadpool(handle)
    log.info("Payment webhook: %s", result)
    return {"received": True}
