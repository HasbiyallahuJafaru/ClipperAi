# ClipperAi — project instructions

## What we are building
An AI video repurposing SaaS: **one long video → many polished 9:16 clips → captions, hooks, titles, per-platform
copy → content calendar → automated publishing (Buffer)**, also operable by AI assistants through MCP.
"I give it a video and it gives me a month of content." Full spec: `masterprompt.md` (source of truth for scope and
phase order). Dependency/license/cost decisions: `DECISIONS.md` (update it whenever a dependency changes).

### Channels (additions to masterprompt.md, decided 2026-09-14, narrowed 2026-09-15)
One account, one subscription, one usage balance. **The only ways to use the product are the website and MCP**
(user, 2026-09-15: the Telegram bot and the command-line tool were scrapped; don't build them or other channels):
- **Website** (`apps/website`, Next.js): the **only place to pay** (subscriptions) and a full way to use the product
  (submit videos, review clips, schedule, see usage and billing).
- **MCP server**: use the product from AI assistants. Lives in `apps/mcp` if it needs its own deployable; otherwise
  mounted inside the backend (FastAPI + official `mcp` SDK). Decide in Phase 8 — default to the backend unless there is
  a concrete reason to split.

The backend REST API is the website's backend, not a separate product channel. Channels are thin clients. **Auth,
subscription checks and usage limits are enforced once, in the backend services** (`jobs.py`, `billing.py`,
`publishing.py`), never re-implemented per channel.

### Accounts: Clerk (user decision, 2026-09-15)
**Use Clerk for everything it offers around accounts** instead of building our own: sign-in/sign-up UI, the user
database (we store only Clerk user ids as owners, no users/passwords table), sessions and token verification in the
backend, Clerk Organizations for teams/workspaces, and OAuth sign-in for MCP clients. Clerk app id:
`app_3JMJIEqTu79eUjLFgFDsRzpNa7h` (always pass `--app` to `clerk init`). Website: `@clerk/nextjs` (`ClerkProvider` inside
`<body>`, `await auth()`, Next 16 `proxy.ts` matcher includes `'/__clerk/:path*'` after `'/(api|trpc)(.*)'`). Never expose
`CLERK_SECRET_KEY` to client code; don't read or print env files. Payments stay off; if they're switched on, ask
whether to use Clerk Billing before choosing a provider. **Built 2026-09-15:** sign-in/up + protected pages, backend
token verification, per-owner data. Next: MCP with Clerk OAuth.

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
- **Business logic lives in backend service modules** (`jobs.py` projects, `billing.py` plans/limits, `publishing.py`
  Buffer; shared by the REST API, MCP server and worker). Route and tool handlers stay thin and call the same
  services — no duplicate logic per channel. The website only talks to the backend through its `/api/*` proxy.
- **Long work never blocks a request**: create a project → return id → worker processes → client polls status.
- **Cost rules**: existing/cached transcript before paid STT (transcripts cached by source key in Postgres); cheapest
  acceptable model (deepseek-flash) before stronger (deepseek-v4-pro); cache results; temporary storage only; delete
  temp media; bounded worker concurrency; track real per-user costs (Phase 9). Don't sacrifice reliability for cents.
- **Modular monolith.** No Redis, queues, ORMs or microservices until a demonstrated need.
- **Storage**: never Railway's filesystem for media. R2 with signed URLs; lifecycle rules delete `uploads/` (1 day)
  and `projects/` (30 days). Don't store users' source videos beyond processing. Only exception: a clip being
  published is copied to the public bucket (`S3_PUBLIC_BUCKET`, Buffer can't read signed links) and deleted once posted.
- **Publishing through a provider (Buffer)**, users connect their own accounts via OAuth/their key; never ask for
  social passwords. Don't build per-network integrations in the MVP. Single posts are sent in the request; content
  calendar posts are queued (`publications.status = 'queued'`) and handed to Buffer by the worker.
- **UI (Phase 5)**: Next.js + TypeScript + Tailwind, extremely clean and minimal, no gradients/card clutter/generic
  AI-SaaS look; human-readable progress messages ("Finding your strongest moments...").

## Security rules
- **The GitHub repo is public** (github.com/HasbiyallahuJafaru/ClipperAi). Never commit `.env`, keys, tokens,
  `pgdata/`, media. Scan staged files for secrets before every commit. Never print key values in output.
- Secrets only in `apps/backend/.env` (template: `.env.example`); no API keys in the frontend or MCP responses.
- Subprocess calls use argument arrays, never shell strings with user input.
- Sources must pass `jobs.public_url` (http/https, public IPs only) or be `upload:<uuid>` that exists in storage.
- Every API route requires a verified Clerk session token (`api.signed_in`) and acts for its owner: the active Clerk
  organization id, else the user id. Every service function takes `owner` and filters by it; never add a query that
  reads or changes projects, plans or posts without it (test_jobs.py checks another account sees nothing). MCP is
  never anonymous.
- **Licensing**: no GPL/AGPL code in the product without explicit evaluation (e.g. Ultralytics YOLO and Postiz are
  AGPL — avoid). Prefer MIT/Apache/BSD. Every dependency goes in `DECISIONS.md`.

## Testing against real services (Buffer, R2, social accounts)
- **Never post publicly to the user's accounts without their explicit go-ahead.** Default: schedule days ahead, verify
  in Buffer, unschedule, then check Buffer has 0 waiting posts and the public bucket is empty. Label test content
  clearly ("ClipperAi ... test").
- Buffer limits on this account: **100 API requests per 15 minutes** and **10 scheduled posts** (the plan's cap; more
  are refused with "Scheduled posts limit reached"). Don't loop against the real API.
- Claude Code's auto-mode permission check can block commands that create or change real posts (and then related
  read-only commands too). Don't work around it: stop, say exactly what's left in a half-done state, and give the user
  the command to run themselves (they can type `! <command>`) or ask them to add an allow rule.
- `dev.py` always uses fake S3; for real R2 + Buffer run `uvicorn api:app` and `python jobs.py` separately.

## Git
- Commit or push only when the user asks. End commit messages with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Work directly on `main`; don't create branches** (user instruction, 2026-09-14).
- Git identity is set per repo (HasbiyallahuJafaru); don't touch global config.

## Commands (run from `apps/backend`, Windows, Python venv at `.venv`)
```bash
export PATH="$PATH:/c/Users/USER/AppData/Local/Microsoft/WinGet/Links"   # ffmpeg/ffprobe (winget) in Bash tool shells
.venv/Scripts/python test_clipper.py        # engine checks (needs ffmpeg)
.venv/Scripts/python test_jobs.py           # queue + storage + billing + publishing vs throwaway Postgres (pgserver),
                                            # S3 (moto) and Buffer (fake_buffer.py)
.venv/Scripts/python dev.py                 # API :8000 + worker (projects + calendar posts) + fake in-memory S3 (moto
                                            # :9000), no Cloudflare needed
.venv/Scripts/python dev.py --fake-buffer   # same, publishing goes to an in-memory Buffer with demo channels
.venv/Scripts/python jobs.py                # worker: processes projects and hands queued calendar posts to Buffer
.venv/Scripts/python -m uvicorn api:app --port 8000
.venv/Scripts/python storage.py setup       # once per bucket: lifecycle + CORS
```

Backend `.env` also needs `CLERK_SECRET_KEY` (and on this PC `SSL_CERT_FILE=<CA bundle>`, or Clerk's SDK hangs behind
Avast); `BUFFER_OWNERS` lists the Clerk ids allowed to publish through the workspace's Buffer key.

Website (run from `apps/website`; backend must be running; `.env.local` has `BACKEND_URL` + the Clerk keys):
```bash
export NODE_EXTRA_CA_CERTS=C:/Users/USER/.certs/ca-bundle-with-windows-roots.pem  # this PC: npm AND the Next server
                             # (without it Clerk's handshake fails and signed-in users look signed out)
npm install
npm run dev                  # http://localhost:3000 (binds localhost, not 127.0.0.1: proxy.ts forwards to localhost)
                             # npm run build && npm run start for the production build
node check.mjs               # signed-out checks: API 401, CSRF 403, public pages 200, private pages -> /sign-in
# browser walkthrough of every flow, signed in as the Clerk test user walkthrough+clerk_test@example.com (headless Edge
# via DevTools protocol; backend must be `dev.py --fake-buffer`; changes the local dev DB, clean it afterwards):
cd ../backend && .venv/Scripts/python dev_fixture.py   # prints <project id> <media folder> <sign-in ticket>
cd ../website && node walkthrough.mjs <project id> <media folder> <sign-in ticket>
clerk doctor                 # Clerk integration health (CLI 3.3, logged in, linked to app_3JMJIEqTu79eUjLFgFDsRzpNa7h)
```
Payments are switched off on purpose (user, 2026-09-14): plans show prices but subscribing charges nothing. Don't add a
payment provider or card form unless the user asks.
Next.js 16 changed APIs: read `node_modules/next/dist/docs/` before using an unfamiliar Next feature.
