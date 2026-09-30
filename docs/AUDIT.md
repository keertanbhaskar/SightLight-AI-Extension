# Audit: what was wrong, what changed

Verified by running the code, not just reading it. Items marked 🔴 would stop the product from working at all.

## Extension
| | Problem (original) | Fix |
|---|---|---|
| 🔴 | `START_AGENT` used `sender.tab?.id`; messages from the side panel have no `sender.tab` → **every run failed "No active tab"** | Service worker resolves the active tab itself |
| 🔴 | Agent loop ran **inside the content script**: any navigation (link click, form submit, search) destroyed the task | Orchestrator lives in the service worker; content script is stateless (`resolve` / `act`); runs survive page loads |
| 🔴 | **No voice feature existed** (only an unused offscreen stub) | Web Speech recognizer, permission page, live transcript, auto-run option, spoken results, Alt+Shift+V |
| 🔴 | Content script built as ES module chunk with imports → not loadable as a classic content script | Separate IIFE build for the content script, ES bundle for the worker, Vite multi-page for UI; removed `post-build.js` hack |
| 🔴 | Every extension page installed a catch-all message router replying "No handler", racing the real handler | Only handle known message types, verify `sender.id`, stay silent otherwise |
| 🟠 | Parser: lower-cased payloads, `find` unreachable, `includes('type')` matched "prototype", no URL navigation (`go to youtube` clicked "youtube"), no multi-step, no quoted text, wrong field/text split | Rewritten: quote protection, clause splitting, URL/site resolution, ordinals, last-preposition split, unknown clauses reported. 31 tests |
| 🟠 | Click executor fired ~7 event strategies + `eval`'d `onclick`: **checkboxes toggled twice, carts added 3×, forms double-submitted** | One pointer sequence + one `click()`; occlusion + disabled checks |
| 🟠 | Typing set `value +=` per char: React/Vue inputs ignored it; search never submitted | Native value setter + `InputEvent`; `contenteditable` via `execCommand`; Enter → `requestSubmit` / nearby submit button |
| 🟠 | Planning failure called `complete()` → **failed tasks reported as success** | Not-found now fails the run with the closest matches listed |
| 🟠 | Safety: substring match ("border"→"order", "sender"→"send"); runtime limit compared seconds with ms and **never triggered** | Word-boundary rules, sensitive-field and href checks, consistent units, confirmation routed through the panel (denied if closed) |
| 🟠 | Matching: char-overlap scoring, viewport math mixed page/viewport coordinates, no shadow DOM | Token/fuzzy scoring with label-source weights, open shadow DOM, correct viewport logic |
| 🟡 | 59 MB zip (node_modules/dist committed), hard-coded `localhost` backend, unused ONNX/vision deps, 450-line debug overlay | ~250 KB build; sync is opt-in with login UI and offline queue; dead code removed |

## Backend
| | Problem | Fix |
|---|---|---|
| 🔴 | `CORS_ORIGINS=a,b` (the project's own `.env` format) **crashed startup** (`List[str]` needs JSON) | Comma-separated string + validated property |
| 🔴 | `Action.metadata` is reserved in SQLAlchemy Declarative → models fail to import | Attribute `meta` mapped to column `metadata`; API name unchanged |
| 🔴 | `requirements.txt` contained non-existent `python-cors`; **no migrations existed** but the Dockerfile ran `alembic upgrade head` | Clean pinned deps; initial migration generated and **verified on Postgres 16** (upgrade, downgrade, re-upgrade, drift check) |
| 🔴 | `POST /executions/...` returned 500 (`MissingGreenlet`: lazy-loaded `actions` in async session); sync could never work | `selectin` loading |
| 🟠 | Weak/default JWT secret accepted; `create_all` on boot fighting Alembic; docs exposed in prod | Production guards (≥32-char secret, no `*` CORS), migrations only, docs off in prod |
| 🟠 | `python-jose`/`passlib` (unmaintained, CVEs) | PyJWT + argon2-cffi; token-type separation; `none`/forged/expired tokens rejected; dummy hash against user enumeration timing |
| 🟠 | No rate limit, unbounded password length (argon2 DoS), case-sensitive emails, `ilike` wildcard abuse, 403 instead of 401 | Limiter, 8–128 char bounds, normalised emails, escaped search, proper 401 |
| 🟠 | Health endpoint returned 200 when DB down and leaked errors | `/health` (liveness), `/health/ready` + `/health/database` (503, generic message) |
| 🟡 | Root container user, dev server in Docker, no healthcheck | Multi-stage, non-root, gunicorn+uvicorn workers, healthcheck, entrypoint migrations |

## Web
Did not compile (missing Vite env typings, unused vars) and hard-coded `http://localhost:8000`.
Now builds, is same-origin (`/api` proxied by nginx; Vite proxy in dev), served by unprivileged nginx with CSP.

## Test coverage added
Extension **91** tests (parser, matcher, safety, DOM actions, content-script integration on a realistic page,
orchestrator with mocked Chrome APIs, voice recognizer). Backend **26** tests (config, auth/JWT attacks, tenancy
isolation, extension sync flow, analytics, CORS, headers). CI also runs the migration round-trip on Postgres.

## Not verified here (needs your machine)
No Chrome was available in the build sandbox, so the extension was verified via build output, jsdom integration
tests and mocked Chrome APIs, **not by driving a real browser**. Before publishing, run through this checklist:
load unpacked → `go to example.com` → `click more information` → voice command on first use (mic prompt tab) →
a risky click shows the confirmation dialog → Stop mid-run. Also not exercised: Docker image builds (Docker
unavailable) — the commands mirror what was run natively (gunicorn + Alembic on Postgres 16, `npm run build`).
