# SightLite

Control your browser with **text or voice**. SightLite is a Chrome (MV3) side-panel extension that turns
instructions like *"go to youtube.com, search for lo-fi beats, click the first video"* into real page actions,
with a safety layer that asks before anything risky (purchases, deletions, sends, password fields).
An optional backend + dashboard records task history and analytics.

```
apps/extension   Chrome extension (TypeScript, React side panel, Vite)
apps/web         Analytics dashboard (React + Vite, served by nginx)
backend          FastAPI + PostgreSQL + Alembic
docs             AUDIT.md (what changed and why), DEPLOYMENT.md
```

## Quick start

**Extension** (Chrome 116+)
```bash
cd apps/extension
npm ci
npm run build          # typecheck + bundle into dist/
```
`chrome://extensions` → enable *Developer mode* → *Load unpacked* → select `apps/extension/dist`.
Click the toolbar icon to open the panel. `npm run dev` rebuilds on change; `npm test` runs the suite;
`npm run package` produces `release/sightlite-<version>.zip` for the Chrome Web Store.

**Backend + dashboard** (Docker)
```bash
cp .env.example .env     # set POSTGRES_PASSWORD and JWT_SECRET (python -c "import secrets;print(secrets.token_hex(32))")
docker compose up --build
# dashboard: http://localhost:8080   API health: http://localhost:8080/api/health
```
Migrations run automatically on API start. Backend sync is optional: in the extension's ⚙ Settings enter the
backend URL, sign in, and each finished run is uploaded (queued offline and retried if the server is down).

**Local backend dev**
```bash
cd backend && pip install -r requirements-dev.txt
cp .env.example .env && alembic upgrade head && uvicorn app.main:app --reload
pytest
```

## Using it

| You say / type | What happens |
|---|---|
| `go to github.com` · `open youtube` | Navigates (http/https only) |
| `search for cats on youtube` | Direct search-results URL for known sites |
| `search for python jobs` | Types into the page's search box and presses Enter |
| `click the login button` · `click the 2nd result` | Finds the best match; ordinals skip nav/footer links |
| `type hello in the search box` · `fill the email field with a@b.com` | Works with React/Vue inputs |
| `scroll down three times` · `scroll to the pricing table` · `go back` · `wait 2 seconds` | |
| Chain with `then`, `and then`, `,` | `go to google.com, search for cats then click the first result` |

The panel previews the parsed plan before you run it. Anything it can't understand is flagged, never guessed.

### Voice
Press the 🎙 button (or **Alt+Shift+V**, which also opens the panel). First use opens a one-time tab to grant
microphone access (Chrome can't show that prompt inside a side panel). Settings let you pick the language and
enable *run immediately after speaking*; results are spoken back for hands-free use.
Spoken forms like "youtube dot com", filler words and "can you please…" are cleaned up automatically.

> **Privacy:** speech-to-text is performed by Chrome's built-in service, which sends audio to Google while
> you dictate. SightLite does not record or store audio; parsing and execution happen locally.

## Safety model
- Risky clicks (buy/pay/delete/send/post/log out/…), risky links, password/card fields, and form submits
  whose button looks risky require **explicit confirmation in the panel**. Matching is word-boundary based.
- Confirmation needed but panel closed → the action is **denied**, not auto-approved.
- Hard limits: max steps and max runtime (Settings). `javascript:`, `file:`, `chrome:` URLs are blocked.
- Stop button aborts immediately, even mid-wait.

## Known limitations
- Acts in the top frame only (cross-origin iframes are not entered). Closed shadow DOM is invisible.
- Clicks/keys are synthetic (`isTrusted=false`); a few sites ignore them. Hardening option: Chrome `debugger` API (shows a banner).
- The previous "vision" (ONNX) perception path was a stub and has been removed; DOM perception is the only mode.
- Rate limiting on auth is per-process; put a shared limiter in front for multi-instance deployments.
- Access tokens in the dashboard live in `localStorage`; nginx ships a strict CSP to reduce XSS risk.

# SightLight-AI-Extension
