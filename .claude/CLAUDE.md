# ClipperAi — project instructions

## What we are building
An AI video repurposing SaaS: **one long video → many polished 9:16 clips → captions, hooks, titles, per-platform
copy → content calendar → automated publishing (Buffer)**, also operable by AI assistants through MCP.
"I give it a video and it gives me a month of content." Full spec: `masterprompt.md` (source of truth for scope and
phase order). Dependency/license/cost decisions: `DECISIONS.md` (update it whenever a dependency changes).

### Channels (additions to masterprompt.md, decided 2026-09-14)
One account, one subscription, one usage balance — reachable through three channels:
- **Website** (`apps/website`, Next.js): the **only place to pay** (subscriptions) and a full way to use the product
  (submit videos, review clips, schedule, see usage and billing).
- **MCP server**: use the product from AI assistants. Lives in `apps/mcp` if it needs its own deployable; otherwise
  mounted inside the backend (FastAPI + official `mcp` SDK). Decide in Phase 8 — default to the backend unless there is
  a concrete reason to split.
- **Telegram bot** (planned, not in the original spec): use the product from Telegram (send a link/video, get clips
  back). Telegram users link to their website account; no payments inside the bot.

Channels are thin clients. **Auth, subscription checks and usage limits are enforced once, in the backend services**
(`jobs.py`, `billing.py`), never re-implemented per channel.

Build progress, what's left and lessons learned: @memory.md — **read it before starting work and update it after
every milestone** (what was done, how it was verified, what's pending, new gotchas). Dates are absolute (YYYY-MM-DD).

## Working rules
- **Ponytail (laziest solution that works).** Use the ponytail skill on coding tasks. Climb the ladder: does it need
  to exist → already in the codebase → stdlib → native platform feature (DB constraint, bucket lifecycle rule, CSS)
  → installed dependency → one line → minimal code. No interfaces with one implementation, no config for values that
  never change, no scaffolding "for later". Mark deliberate corner-cutting with a `# ponytail:` comment naming the
  ceiling and upgrade path. Never simplify away validation at trust boundaries, security, or data-loss handling.
- **Understand before changing.** Read the code a change touches end to end; fix root causes in the shared function.
- **Every non-trivial piece of logic leaves one runnable check** (plain `assert` scripts, no test frameworks).
- **Never claim something works without running it.** Run tests, run the real thing, look at the output (frames,
  JSON, HTTP responses). Say plainly what was not verified.
- **Follow `masterprompt.md` phase order** (§45) unless evidence says otherwise; do not build later phases early.
- Plain-English, audience-aware explanations for the user; they are building a product, not reading internals.

## Product/architecture rules (from masterprompt.md)
- **AI decides, deterministic software executes.** LLMs pick moments and write copy; FFmpeg/OpenCV/libass cut, crop,
  caption. Never use generative video/image models for what FFmpeg can do.
- **Never trust model output**: schema-validate (pydantic), retry, reject. Timestamps come from the transcript/pass 1,
  never invented. **Spoken caption text comes only from the transcript.**
- **Business logic lives in backend service modules** (`jobs.py` projects, `billing.py` plans/limits; shared by REST
  API, MCP server, Telegram bot, worker). Route and bot/tool handlers stay thin and call the same services — no
  duplicate logic per channel. The website only talks to the backend through its `/api/*` proxy.
- **Long work never blocks a request**: create a project → return id → worker processes → client polls status.
- **Cost rules**: existing/cached transcript before paid STT (transcripts cached by source key in Postgres); cheapest
  acceptable model (deepseek-flash) before stronger (deepseek-v4-pro); cache results; temporary storage only; delete
  temp media; bounded worker concurrency; track real per-user costs (Phase 9). Don't sacrifice reliability for cents.
- **Modular monolith.** No Redis, queues, ORMs or microservices until a demonstrated need.
- **Storage**: never Railway's filesystem for media. R2 with signed URLs; lifecycle rules delete `uploads/` (1 day)
  and `projects/` (30 days). Don't store users' source videos beyond processing.
- **Publishing through a provider (Buffer)**, users connect their own accounts via OAuth/their key; never ask for
  social passwords. Don't build per-network integrations in the MVP.
- **UI (Phase 5)**: Next.js + TypeScript + Tailwind, extremely clean and minimal, no gradients/card clutter/generic
  AI-SaaS look; human-readable progress messages ("Finding your strongest moments...").

## Security rules
- **The GitHub repo is public** (github.com/HasbiyallahuJafaru/ClipperAi). Never commit `.env`, keys, tokens,
  `pgdata/`, media. Scan staged files for secrets before every commit. Never print key values in output.
- Secrets only in `apps/backend/.env` (template: `.env.example`); no API keys in the frontend or MCP responses.
- Subprocess calls use argument arrays, never shell strings with user input.
- Sources must pass `jobs.public_url` (http/https, public IPs only) or be `upload:<uuid>` that exists in storage.
- Every API route requires `Authorization: Bearer <API_KEY>` until per-user auth exists. MCP is never anonymous.
- **Licensing**: no GPL/AGPL code in the product without explicit evaluation (e.g. Ultralytics YOLO and Postiz are
  AGPL — avoid). Prefer MIT/Apache/BSD. Every dependency goes in `DECISIONS.md`.

## Git
- Commit or push only when the user asks. End commit messages with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Work directly on `main`; don't create branches** (user instruction, 2026-09-14).
- Git identity is set per repo (HasbiyallahuJafaru); don't touch global config.

## Commands (run from `apps/backend`, Windows, Python venv at `.venv`)
```bash
export PATH="$PATH:/c/Users/USER/AppData/Local/Microsoft/WinGet/Links"   # ffmpeg/ffprobe (winget) in Bash tool shells
.venv/Scripts/python test_clipper.py        # engine checks (needs ffmpeg)
.venv/Scripts/python test_jobs.py           # queue + storage + billing vs throwaway Postgres (pgserver) + S3 (moto)
.venv/Scripts/python clipper.py <url> -n 3  # CLI run -> out/<source key>/
.venv/Scripts/python dev.py                 # API :8000 + worker + fake in-memory S3 (moto :9000), no Cloudflare needed
.venv/Scripts/python jobs.py                # worker
.venv/Scripts/python -m uvicorn api:app --port 8000
.venv/Scripts/python storage.py setup       # once per bucket: lifecycle + CORS
```

Website (run from `apps/website`; backend must be running, `.env.local` has `BACKEND_URL` + `BACKEND_API_KEY`):
```bash
NODE_EXTRA_CA_CERTS=C:/Users/USER/.certs/ca-bundle-with-windows-roots.pem npm install   # Avast breaks npm TLS here
npm run dev                  # http://127.0.0.1:3000 (npm run build && npm run start for the production build)
node check.mjs               # proxy checks against the running site (no paid calls)
# browser walkthrough of every flow (headless Edge via DevTools protocol; changes the local dev DB):
cd ../backend && .venv/Scripts/python dev_fixture.py   # prints <project id> <media folder>
cd ../website && node walkthrough.mjs <project id> <media folder>
```
Payments are switched off on purpose (user, 2026-09-14): plans show prices but subscribing charges nothing. Don't add a
payment provider or card form unless the user asks.
Next.js 16 changed APIs: read `node_modules/next/dist/docs/` before using an unfamiliar Next feature.
