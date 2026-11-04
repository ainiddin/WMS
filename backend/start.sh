#!/bin/sh
# Container start (Render / Docker): migrate, make sure the first admin exists, then serve API + site.
set -e
alembic upgrade head
if [ "$SEED_DEMO" = "true" ]; then
  python -m app.seed --demo-if-empty
else
  python -m app.seed
fi
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --proxy-headers --forwarded-allow-ips='*'
