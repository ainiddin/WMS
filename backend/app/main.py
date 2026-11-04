import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.db.session import SessionLocal
from app.routers import admin, auth, catalog, customers, movements, orders, performance, reports
from app.services.user_service import ensure_first_admin

log = logging.getLogger("keyfive")


@asynccontextmanager
async def lifespan(_: FastAPI):
    # First start: create Admin001@wms.kz from .env if there is no Admin yet.
    with SessionLocal() as db:
        try:
            if ensure_first_admin(db):
                db.commit()
                log.warning("First admin %s created", settings.ADMIN_EMAIL)
        except RuntimeError as exc:
            log.error("%s", exc)
    yield


app = FastAPI(
    title="KeyFive WMS API",
    version="1.0.0",
    description="Warehouse Management System — Basics of Information Systems, KBTU 2026.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)


# PostgreSQL error codes -> HTTP answer. The rules live in the database too, this makes their errors readable.
_PG_ERRORS = {
    "23505": (status.HTTP_409_CONFLICT, "Value already exists"),
    "23503": (status.HTTP_409_CONFLICT, "Record is used by other records (has history); deactivate it instead"),
    "23514": (status.HTTP_422_UNPROCESSABLE_CONTENT, "Data breaks a database rule"),
    "23502": (status.HTTP_422_UNPROCESSABLE_CONTENT, "A required value is missing"),
}


@app.exception_handler(IntegrityError)
async def integrity_error_handler(_: Request, exc: IntegrityError):
    orig = exc.orig
    code = getattr(orig, "sqlstate", None)
    http_status, message = _PG_ERRORS.get(code, (status.HTTP_409_CONFLICT, "Database rule violated"))
    diag = getattr(orig, "diag", None)
    constraint = getattr(diag, "constraint_name", None)
    body = {"detail": message}
    if constraint:
        body["constraint"] = constraint
    return JSONResponse(status_code=http_status, content=body)


for module in (auth, admin, catalog, customers, movements, orders, reports, performance):
    app.include_router(module.router)


@app.get("/health", tags=["health"])
def health():
    with SessionLocal() as db:
        db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "ok"}
