# Deployment

## Backend + dashboard
1. Provision Postgres (managed is best). Set `DATABASE_URL` (`postgresql://…`; the async driver is added automatically).
2. Set `ENVIRONMENT=production`, `JWT_SECRET` (≥32 random chars; app refuses to start otherwise),
   `CORS_ORIGINS` (explicit origins; not needed when the dashboard proxies `/api` same-origin).
3. `docker compose up -d --build`, or build `backend/` and `apps/web/` images separately.
   Put TLS in front (Caddy / Cloud LB); HSTS is sent automatically in production.
4. Multiple API replicas: set `RUN_MIGRATIONS=0` and run `alembic upgrade head` once as a release job.
5. Probes: liveness `GET /api/health`, readiness `GET /api/health/ready`.
6. Back up Postgres; rotate `JWT_SECRET` to invalidate all sessions.

## Chrome Web Store
1. `cd apps/extension && npm ci && npm run package` → `release/sightlite-<version>.zip`.
2. Bump `version` in `package.json` for each submission (manifest version is injected from it).
3. Store listing notes: host permission `http(s)://*/*` is required to act on any page — justify it as the core
   purpose. Disclose that voice uses Chrome's speech service, and that optional sync sends task text and step
   logs to the backend you configure. Provide a privacy policy URL.
4. Re-test the checklist in `docs/AUDIT.md` ("Not verified here") on the packaged build.
