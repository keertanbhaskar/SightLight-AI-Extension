#!/bin/sh
set -eu
# Apply migrations before serving. With several replicas run this as a one-off job instead (RUN_MIGRATIONS=0).
if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
  echo "Running database migrations..."
  alembic upgrade head
fi
exec gunicorn app.main:app \
  --worker-class uvicorn.workers.UvicornWorker \
  --workers "${WEB_CONCURRENCY:-2}" \
  --bind "0.0.0.0:${PORT:-8000}" \
  --timeout 30 --graceful-timeout 20 --keep-alive 5 \
  --forwarded-allow-ips "${FORWARDED_ALLOW_IPS:-127.0.0.1}" \
  --access-logfile -
