# YT-Clipper — project instructions

**Product name: YT-Clipper** (renamed from ClipperAi, user 2026-09-15). The repo, folder, storage buckets and code
names keep the old name; every user-facing text says YT-Clipper.

## What we are building
An AI video repurposing SaaS: **one long video → many polished 9:16 clips → captions, titles, hooks (as text), per-platform
copy → content calendar → automated publishing (Buffer)**, on the website and in a Flutter mobile app.
"I give it a video and it gives me a month of content." Full spec: `masterprompt.md` (source of truth for scope and
phase order). Dependency/license/cost decisions: `DECISIONS.md` (update it whenever a dependency changes).

### Channels (decided 2026-09-14, narrowed 2026-09-15; MCP replaced by a mobile app 2026-09-15)
One account, one subscription, one usage balance. **The only ways to use the product are the website and the mobile
app** (user, 2026-09-15: the Telegram bot, the command-line tool and the **MCP server were scrapped**; don't build
them or other channels):
- **Website** (`apps/website`, Next.js): the **only place to pay** (subscriptions) and a full way to use the product
  (submit videos, review clips, schedule, see usage and billing).
- **Mobile app** (`apps/mobile`, Flutter, app name "YT-Clipper", id `xyz.ytclipper.app`; **Android first**, iOS code
  kept but no build route yet; Phase 8, feature-complete with the website 2026-09-15): submit a link, a phone video or
  something shared from another app (YouTube's Share button), follow progress, review/edit/approve clips, save or share
  clips, publish now or schedule, content calendar, plan and usage (read-only). Never run on a device yet. It
  calls the FastAPI REST API directly over HTTPS with the Clerk session token as a Bearer token (the website's `/api`
  proxy is for the browser only). **No purchases in the app** (store in-app purchase rules): plans are managed on the
  website. No secrets or provider keys in the app.

**Domain: `ytclipper.xyz`** (user, 2026-09-15). **Deployed 2026-09-15:** backend on **Railway** project `ytclipper`
(services `api` + `worker` from one Dockerfile in `apps/backend`, Railway Postgres; media stays on R2), API at
`https://api-production-e0fc.up.railway.app` (`/health`); website on **Vercel** project `website` (root `apps/website`,
deploys on every push to `main`, https://website-pearl-seven-93.vercel.app; its Deployment Protection still puts the
`.vercel.app` URL behind Vercel login until the user changes it or connects the domain). Subdomains are not decided yet (a natural split: website on `ytclipper.xyz`, API on
`api.ytclipper.xyz` for the app, public clip copies on a media subdomain instead of r2.dev); ask before wiring DNS. The backend REST
API serves the website and the mobile app; it is not a separate product channel. Channels are thin clients. **Auth,
subscription checks and usage limits are enforced once, in the backend services** (`jobs.py`, `billing.py`,
`publishing.py`), never re-implemented per channel.

### Accounts: Clerk (user decision, 2026-09-15)
**Use Clerk for everything it offers around accounts** instead of building our own: sign-in/sign-up UI, the user
database (we store only Clerk user ids as owners, no users/passwords table), sessions and token verification in the
backend, Clerk Organizations for teams/workspaces, and sign-in in the mobile app (`clerk_flutter` **0.0.18-beta**,
community-maintained, pinned exactly; user accepted the beta risk 2026-09-15). Clerk app id:
`app_3JMJIEqTu79eUjLFgFDsRzpNa7h` (always pass `--app` to `clerk init`). Website: `@clerk/nextjs` (`ClerkProvider` inside
`<body>`, `await auth()`, Next 16 `proxy.ts` matcher includes `'/__clerk/:path*'` after `'/(api|trpc)(.*)'`). Never expose
`CLERK_SECRET_KEY` to client code; don't read or print env files. Payments stay off; if they're switched on, ask
whether to use Clerk Billing before choosing a provider. **Built 2026-09-15:** sign-in/up + protected pages, backend
token verification, per-owner data; the app's native tokens carry no `azp`, so `api.signed_in` checks the site only
when a token names one. Still a **development instance** (production instance comes with the domain).

### Finding things: graphify first, not the whole build log (user, 2026-09-15)
To save tokens, **don't read `.claude/memory.md` (or big files) end to end.** Look things up in the graphify map of the
repo (code, docs, the build log and the spec), then read only the lines it points to:
```bash
graphify query "where are posts sent to Buffer?" --budget 1500   # BFS over graphify-out/graph.json
graphify explain "send_queued"        # one symbol and its neighbours
graphify path "api.py" "billing.py"   # how two things connect
graphify affected apps_backend_jobs_update_clip   # what a change would touch (a name in two files needs the id
                                                  # that `explain` prints)
```
(`graphify` = `C:/Users/USER/AppData/Roaming/Python/Python312/Scripts/graphify` if it isn't on PATH; package
`graphifyy` 0.9.48, Apache-2.0.) The map is local and free: `graphify update .` rebuilds it from the repo root in ~10 s
without any AI calls (respects `.gitignore`, so `.env`, `pgdata/`, media and dependencies stay out). Git hooks rebuild it
after every commit and checkout. `graphify-out/` is not committed. When the map can't answer, fall back to a targeted
Grep, then to the matching `memory.md` section only.

`.claude/memory.md` stays the build log: **update it after every milestone** (what was done, how it was verified,
what's pending, new gotchas). Dates are absolute (YYYY-MM-DD).

## Working rules
- **Ponytail (laziest solution that works).** Use the ponytail skill on coding tasks. Climb the ladder: does it need
  to exist → already in the codebase → stdlib → native platform feature (DB constraint, bucket lifecycle rule, CSS)
  → installed dependency → one line → minimal code. No interfaces with one implementation, no config for values that
  never change, no scaffolding "for later". Mark deliberate corner-cutting with a `# ponytail:` comment naming the
  ceiling and upgrade path. Never simplify away validation at trust boundaries, security, or data-loss handling.
- **Understand before changing.** Read the code a change touches end to end; fix root causes in the shared function.
- **Every non-trivial piece of logic leaves one runnable check** (plain `assert` scripts, no test frameworks on the
  backend and website; the Flutter app uses `flutter test`).
- **Every feature ends the same way (user, 2026-09-15):** (1) add or extend the tests that prove it works; (2) run all
  checks for the parts it touches and make sure everything still passes: `test_clipper.py`, `test_jobs.py`, website
  `next build` + `check.mjs` + `walkthrough.mjs`, and `flutter analyze` + `flutter test` for the app; (3) run
  `graphify update .` so the map knows the new code; (4) update `memory.md` (and README/DECISIONS/DESIGN when they
  change). A feature isn't done while a check fails or wasn't run; say which checks were skipped and why.
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
  Buffer; shared by the REST API and the worker). Route handlers stay thin and call the same services — no duplicate
  logic in the website or the mobile app. The website only talks to the backend through its `/api/*` proxy; the mobile
  app calls the REST API directly.
- **Long work never blocks a request**: create a project → return id → worker processes → client polls status.
- **Cost rules**: existing/cached transcript before paid STT (transcripts cached by source key in Postgres); cheapest
  acceptable model (deepseek-flash) before stronger (deepseek-v4-pro); cache results; temporary storage only; delete
  temp media; bounded worker concurrency; track real per-user costs (Phase 9). Don't sacrifice reliability for cents.
- **Modular monolith.** No Redis, queues, ORMs or microservices until a demonstrated need.
- **Storage**: never Railway's filesystem for media. R2 with signed URLs; lifecycle rules delete `uploads/` (1 day)
  and `projects/` (30 days). Don't store users' source videos beyond processing. Only exception: a clip being
  published is copied to the public bucket (`S3_PUBLIC_BUCKET`, Buffer can't read signed links) and deleted once posted.
- **Publishing through a provider (Buffer)**, users connect their own accounts via OAuth/their key; never ask for
  social passwords. **Today one workspace Buffer key** serves the accounts in `BUFFER_OWNERS`. Per-user connection is an
  open decision (2026-09-15): Buffer's docs say OAuth + PKCE clients can be registered (Settings → API) but 2026
  write-ups say third-party OAuth isn't open; the user checks their Buffer settings. Fallbacks: per-user API key, or a
  multi-customer posting API (Ayrshare / Upload-Post / Zernio) where users connect socials directly. Don't build per-network integrations in the MVP. Single posts are sent in the request; content
  calendar posts are queued (`publications.status = 'queued'`) and handed to Buffer by the worker.
- **UI (redesigned 2026-09-15 after the user's "Relink" reference)**: Next.js + TypeScript + Tailwind; modern premium
  SaaS, **light only**: sky photo heroes, white rounded cards on pale grey, one royal blue accent (#2355f5), Geist,
  pill buttons, Phosphor icons. Yellow only inside clip captions. Each nav link is its own page (user, 2026-09-15), the
  home page is just the hero. Tokens/components: `app/globals.css`, system notes: `DESIGN.md`. Keep human-readable
  progress messages ("Finding your strongest moments...") and every text `walkthrough.mjs` clicks. **The app follows
  the website's UI** (user, 2026-09-15): same tokens in `apps/mobile/lib/main.dart`, Geist + Instrument Serif TTFs.
- **Clips (user, 2026-09-15):** no text drawn over the start of a clip (the old black-box "hook" overlay is removed;
  hooks stay as editable copy). Captions are burned in unless the project sets `captions: false` (for videos that
  already have subtitles); the `.ass` caption file is made either way. Auto-detecting burned-in subtitles is not built.
- **SEO pages must stay true:** `compare/data.ts`, `tools/data.ts` and the FAQ only state what the product does today;
  competitor facts are dated with sources. Re-check them when the product or prices change. OpenSEO project
  `YT-Clipper` holds competitors, positioning and the research log.

## Security rules
- **The GitHub repo is public** (github.com/HasbiyallahuJafaru/ClipperAi). Never commit `.env`, keys, tokens,
  `pgdata/`, media. Scan staged files for secrets before every commit. Never print key values in output.
- Secrets only in `apps/backend/.env` (template: `.env.example`); no API keys in the website or the mobile app.
- Subprocess calls use argument arrays, never shell strings with user input.
- Sources must pass `jobs.public_url` (http/https, public IPs only) or be `upload:<uuid>` that exists in storage.
- Every API route requires a verified Clerk session token (`api.signed_in`) and acts for its owner: the active Clerk
  organization id, else the user id. Every service function takes `owner` and filters by it; never add a query that
  reads or changes projects, plans or posts without it (test_jobs.py checks another account sees nothing). The mobile
  app is never anonymous.
- **Licensing**: no GPL/AGPL code in the product without explicit evaluation (e.g. Ultralytics YOLO and Postiz are
  AGPL — avoid). Prefer MIT/Apache/BSD. Every dependency goes in `DECISIONS.md`.

## Testing against real services (Buffer, R2, social accounts)
- **Never post publicly to the user's accounts without their explicit go-ahead.** Default: schedule days ahead, verify
  in Buffer, unschedule, then check Buffer has 0 waiting posts and the public bucket is empty. Label test content
  clearly ("YT-Clipper ... test").
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
Mobile app (run from `apps/mobile`; Flutter 3.47 at `C:/dev/flutter`):
```bash
flutter analyze && flutter test            # 13 tests: API client, uploads, screens, publishing, calendar, options
# release APK against the live API (the Clerk publishable key is public; read it from the CLI, never print it):
export NODE_EXTRA_CA_CERTS=C:/Users/USER/.certs/ca-bundle-with-windows-roots.pem
export JAVA_TOOL_OPTIONS="-Djavax.net.ssl.trustStoreType=Windows-ROOT"   # this PC: Gradle downloads behind Avast
KEY=$(clerk apps list --json | python -c "import json,sys; print(json.load(sys.stdin)[0]['instances'][0]['publishable_key'])")
flutter build apk --release --dart-define=API_URL=https://api-production-e0fc.up.railway.app --dart-define=CLERK_PUBLISHABLE_KEY="$KEY"
```
Release builds refuse to start without both dart-defines. Release signing reads `android/key.properties` (never
committed); without it the APK is debug-signed (fine for testing, not for the Play Store). Android SDK licences must be
accepted by the user (`flutter doctor --android-licenses`). To look at screens without a device, render them with a
throwaway golden test that loads the real fonts, then delete it.

Deploy (backend): `railway up --service api --detach` and `--service worker` from `apps/backend` (CLI logged in).
Railway variables are set per service (names only: `railway variables --service api --json` → keys); never print
values. Vercel CLI needs `NODE_EXTRA_CA_CERTS` on this PC; in Git Bash set `MSYS_NO_PATHCONV=1` for `vercel api /v9/...`
(it rewrites `/paths`). Creating domains and changing Vercel protection were blocked by the permission check: give
the user the command.

Payments are switched off on purpose (user, 2026-09-14): plans show prices but subscribing charges nothing. Don't add a
payment provider or card form unless the user asks.
Next.js 16 changed APIs: read `node_modules/next/dist/docs/` before using an unfamiliar Next feature.
