# Build memory

Last updated: 2026-09-14. Update after every milestone: move items from "Left" to "Done" with how they were verified.

## Done

### Phase 0 — Research (2026-09-14)
- `DECISIONS.md`: component/license/cost table. Key picks: yt-dlp, Groq Whisper turbo ($0.04/audio-hr), DeepSeek
  (`deepseek-flash`, `deepseek-v4-pro`, OpenAI-compatible), FFmpeg CLI, OpenCV + YuNet face model (MIT), hand-written
  ASS captions, boto3 → R2, Buffer GraphQL API, official `mcp` SDK, Postgres queue.
- Dropped: xAI/Grok STT (no key), MediaPipe (OpenCV already needed), youtube-transcript-api / YouTube auto-captions
  (no punctuation / no word timing; revisit when STT spend matters).

### Phases 1–2 — Clipping engine (`apps/backend/clipper.py`) (2026-09-14)
- Acquire: local file (sha256 key) or yt-dlp (prefers H.264 1080p; `js_runtimes` deno/node; 10 retries).
- Transcribe: Groq `whisper-large-v3-turbo`, word + segment timestamps, 600 s chunks + 10 s overlap, stitched at
  seams (`stitch`). Each chunk encoded standalone as 16 kHz mono **s16** FLAC.
- Select: two passes — flash finds up to 3n candidate moments over the whole transcript, v4-pro picks n and writes
  hook/title/description/hashtags/posts (tiktok, instagram, youtube, linkedin, facebook, x). Pydantic-validated, 3 tries.
  Clip count default ≈ 1 per 6 min (3–30).
- Render: cuts snapped to word edges, YuNet face tracking → steady "shots" → 9:16 crop expression (center-crop
  fallback), ASS captions (≤3 words/≤18 chars, spoken word yellow, hook box first 3 s, Montserrat ExtraBold via
  `fontsdir`), loudnorm −14 LUFS, H.264 1080×1920, thumbnail = frame at 1 s.
- Verified: `test_clipper.py` passes; real runs on https://youtu.be/VTLnDqjfRZQ (25 min tech video → good clips,
  distinct per-platform copy, frames inspected) and "Me at the zoo" (jNQXAC9IVRw).

### Phase 3 — Jobs (`api.py`, `jobs.py`, `db.py`, `migrations/`) (2026-09-14)
- Postgres `projects` table is the job queue (`FOR UPDATE SKIP LOCKED`); statuses queued → downloading →
  transcribing → analyzing → rendering → packaging → completed | failed | cancelled.
- Heartbeat thread (30 s); stale > 2 min → requeued by `claim()`. 3 attempts, backoff 2/4 min; `PERMANENT` errors
  fail at once. Cancel: queued immediately, running at next `progress()`. Transcripts cached in `transcripts` table.
- FastAPI, shared bearer `API_KEY`; source validation blocks files/localhost/private/metadata IPs.
- Local dev DB: blank `DATABASE_URL` → pgserver Postgres 16 in `apps/backend/pgdata` (keeps running between sessions).
- Verified: `test_jobs.py` passes; live API + worker run (401/422 checks, queued→completed in 52 s, transcript reuse,
  live cancel).

### Phase 4 — Storage (`storage.py`) (2026-09-14)
- Outputs uploaded to R2 `projects/<id>/` (mp4, ass, jpg, clips.json); API returns 24 h signed `*_url` per clip and
  `files_expire_at`. Uploads: `POST /api/uploads` → signed PUT → `source: "upload:<uuid>"` (video/* only, ≤5 GB,
  existence + size checked with HEAD). Worker scratch in `tmp/<project id>/` deleted after every run; uploaded source
  deleted when the project is final. Bucket lifecycle via `python storage.py setup` (uploads 1 d, projects 30 d) + CORS.
- Verified: `test_jobs.py` against moto S3 (upload → process → signed GET bytes, expiry hides links, cleanup, retries
  keep upload). **Not yet verified against real Cloudflare R2** (no credentials in `.env` yet).

### Local dev without Cloudflare (2026-09-14)
- User chose to keep building and test real R2 later. `apps/backend/dev.py` runs API + one worker + moto S3 (:9000,
  in-memory, bucket `dev`) in one process; its S3_* env overrides `.env`'s R2 values (load_env uses setdefault).
- Fixed `db.url()` race: API lifespan and worker thread both started the pgserver dev DB at once → second `pg_ctl
  start` failed (log file sharing violation). Now serialized with a lock.
- Verified: real upload through `dev.py` (422 before PUT, PUT 200, queued→completed in ~60 s, all three signed links
  download, clip is 1080×1920 H.264 + AAC, upload deleted, no tmp dirs, lifecycle rules applied); both test suites pass.

### Phase 5, first slice: website + review backend (2026-09-14, pushed)
- Backend: `migrations/003_review.sql` (`clips.review` pending/approved/rejected); `jobs.update_clip` (`ClipEdit`:
  review, title, description, hashtags, posts; hook not editable, it's burned in) → `PATCH
  /api/projects/{id}/clips/{idx}`; `jobs.delete_project` (not while running; row first, then storage + upload) →
  `DELETE /api/projects/{id}` (404/409); list returns `clip_count`; `MESSAGES["retrying"]` for queued-with-error;
  signed GETs carry `response-content-disposition: attachment` (links download, `<video>` still plays); dropped the
  "N segments" analyzing detail (not human-readable).
- Website `apps/website` (Next 16.3 App Router + React 19 + Tailwind 4, nothing else): `/` = new-project form (link or
  upload with XHR progress + drag/drop, options in `<details>`), `/projects/new` same form, `/dashboard` (polls while
  any project runs), `/projects/[id]` (progress steps with caption-yellow "now" marker → results: 9:16 video, hook as a
  dark caption box, per-platform post tabs + copy, downloads, Approve/Reject/Edit, Approve all, cancel/delete).
  `app/api/[...path]/route.ts` forwards to FastAPI adding `BACKEND_API_KEY` (from `.env.local`), refuses
  `Sec-Fetch-Site` other than same-origin/none (CSRF). `npm run dev/start` bind 127.0.0.1 (no sign-in yet).
  Design: Montserrat ExtraBold (caption face, `next/font/local`) headings, system UI body, one accent #FFE600 as fill
  only, light + dark tokens in `globals.css`, text-label controls, no icon/animation libs.
- Verified: `test_jobs.py` (review edits, bad values, delete rules, clip_count, retry message, Content-Disposition) and
  `test_clipper.py` pass; `next build` + TypeScript pass; API key absent from `.next/static`; `node check.mjs` passes
  (key added, cross-site 403, 404/422 pass through, pages 200); through the running site: upload ticket → storage CORS
  preflight + 159 MB PUT (allow-origin ok) → project created → live "retrying" state shown → cancel → delete → 404;
  seeded completed project from real clips (`out/Youtube-VTLnDqjfRZQ`): approve + edit title/X post + reject via
  proxy, reload shows them, invalid review → 422, delete removed stored files. Screenshots (headless Edge) of landing,
  dashboard, progress, review in light/dark/narrow checked; impeccable detector: no findings.
- **Not verified:** a full new project processed to completion through the website (blocked by Avast, see gotchas);
  real mouse/keyboard use (file picker, drag/drop, copy button, edit form submit) in a real browser; video playback.

### Phase 5 rest: batch, content package, pricing/checkout/billing with payments off (2026-09-14, pushed)
- User decisions: one workspace, no sign-in yet; pricing/checkout show real prices ("start at $15") but the backend
  charges nothing. Plans in `billing.py`: Creator $15 (5 videos, 5 h, 50 clips), Pro $39 (15, 15 h, 150), Business $99
  (no video cap, 50 h, 500). Pro/Business prices are the spec's numbers, not confirmed by the user.
- `migrations/004_billing.sql`: `subscriptions` (plan, price_cents, charged_cents 0, status active/ended, one active via
  partial unique index). `billing.py`: `current`, `usage` (calendar month: videos = non-failed/cancelled projects,
  minutes = last transcript segment end of completed projects, clips), `allowance` (raises `LimitError` for no plan /
  hours / clips; `LimitError` subclasses `clipper.PermanentError`), `check_new_project` (+ videos), `subscribe`
  (switch = end current + insert; same plan = no-op), `cancel` (ends now), `summary`. API: `GET /api/billing`,
  `POST /api/billing/subscribe` (201), `POST /api/billing/cancel` (409 if none); `LimitError` → 402 via one exception
  handler; `POST /api/uploads` checks the plan before a file is sent; `jobs.create_project` checks it too.
- Worker: `billing.allowance()` first in `run_job`; passes `max_seconds`/`max_clips` to `clipper.run` (new params:
  source longer than allowance → PermanentError after download, before transcription; n capped). PermanentError
  messages now go into `detail` on failure (shown on the project page; "See plans" link when it mentions a plan).
- Content package: `jobs.content_package` streams a stored ZIP (stdlib `zipfile` over a write-collecting RawIOBase) from
  `storage.chunks` → `GET /api/projects/{id}/package` (`content-package.zip`: videos/, captions/, thumbnails/,
  metadata/clips.csv with BOM + clips.json; skips rejected clips; 409 when nothing to package). Proxy passes
  `Content-Disposition` through. Website: "Download all" button.
- Website: new-project form takes several links (textarea, one per line, Enter submits, Shift+Enter new line) or several
  files (`multiple`, list with Remove); one project each, sequential uploads with "Uploading 2 of 3, 45%"; started items
  leave the form so a retry after an error doesn't duplicate; 1 project → its page, more → dashboard; 402 → "See plans".
  New pages `/pricing`, `/checkout?plan=` (server page reads searchParams → client component), `/settings/billing`
  (plan, usage meters, change/cancel, history table). Nav: Projects, Pricing, Billing. Copy button now reports a blocked
  clipboard.
- Verified: `test_jobs.py` (plans, one active, no-plan refusal, usage rules incl. last month, all limit messages, worker
  refusal with detail, allowance passed to engine, ZIP contents + edited copy + rejected skipped + expiry) and
  `test_clipper.py` (length cap before transcription, clip cap) pass; `next build` passes; `node check.mjs` passes
  (billing + package routes); **`walkthrough.mjs` in headless Edge passed end to end** (no plan → 402 + See plans,
  pricing → checkout $15.00/-$15.00/$0.00 → Creator, switch to Business, history + $0.00, bad link line caught, 2 links
  → 2 projects, 2 files via the real file input → 2 projects, approve, edit form save, reject, Download all fetched and
  saved via click (ZIP inspected: only the non-rejected clip, edited title, valid), cancel plan). Screenshots in light,
  dark and emulated 390 px checked. Test data was removed from the dev DB afterwards.
- **Not verified:** clipboard copy succeeding (headless blocks it even with permission; the blocked message shows);
  a new project processed to completion (Avast); usage minutes on real videos (logic tested with fixtures only).

### Repo (2026-09-14)
- Pushed to https://github.com/HasbiyallahuJafaru/ClipperAi (public, `main`, first commit 402473e) with README,
  `.env.example`, description and topics. Layout: `apps/backend`, `apps/website` (empty), `apps/mcp` (empty).
- Second push: `.claude/CLAUDE.md` (goal, channels, rules) + this memory file, and a full root README (how it works,
  setup, configuration, API reference with examples, retention, reliability, security, costs, troubleshooting,
  roadmap). The code has no license file yet — user to decide.
- Third push (2026-09-14, end of session 2): everything in Phase 5 + billing above, `dev.py`, the `db.py` start lock,
  `check.mjs`, `walkthrough.mjs` + `dev_fixture.py`, updated README/DECISIONS/CLAUDE.md/memory/handover. The user
  clears the session after this push and starts Phase 6 in a new one (start from `handover.md`).

## Left

### Immediate
- [ ] **Live R2 test** (2026-09-14: blocked on token permissions). Account `cc1b1537ed8b55e4e7bb17b518285b38`.
      `.env` now has `S3_ENDPOINT`, `S3_BUCKET=clipperai-media` (not created yet) and S3 keys derived from the user's
      Cloudflare user token (`cfut_…`: key id = token id, secret = SHA-256 of token value). The token is active but has
      no R2/account permission (Cloudflare API: no accounts visible, R2 list = auth error; S3 ListBuckets = AccessDenied).
      Needed: add **Account → Workers R2 Storage → Edit** to that token (derived keys then work unchanged), or create an
      R2 "Admin Read & Write" token and paste its Access Key ID/Secret into `.env`. R2 must be enabled on the account.
      Then: create bucket, `storage.py setup`, upload project + YouTube project end to end, push fixes.
- [ ] Upgrade Groq to Developer plan before real customers (free plan: 20 req/min, 7,200 audio-s/hour,
      28,800 audio-s/day shared across all customers).

### Product direction (decided 2026-09-14, beyond masterprompt.md)
- Three access channels on one account/subscription/usage balance: **website**, **MCP**, **Telegram bot** (planned).
- **Payments happen only on the website** (subscriptions). MCP and Telegram use the product; they never take payment.
- MCP location: `apps/mcp` if it needs its own deployable, else inside the backend (default). Decide in Phase 8.
- Limits/subscription checks enforced once in backend services so every channel gets identical rules.

### Phase 5 — Next.js website (`apps/website`)
- [ ] **Unblock local end-to-end** (user action): Avast Web Shield currently cuts local HTTP downloads > ~1–2 MB and
      breaks yt-dlp HTTPS (see gotchas). Add Avast exceptions (or pause Web Shield) then run a real link + upload
      project through `dev.py` + website and click through review in a real browser.
- [ ] Add `calendar.csv` to the content package when Phase 7 exists.
- [ ] Remaining §39 pages when their phases land: calendar (7), settings/integrations (6), brand.
- [ ] Nice to have: store the video title (yt-dlp info / upload filename) so lists don't show URLs/"Uploaded video";
      re-render with an edited hook ("Render all", §40); a real product visual on the landing page (a clip from a
      video we have rights to).
- [ ] **Real payments** (only when the user asks): provider with hosted checkout + webhooks (no card data on our
      servers) → start checkout in `billing.subscribe`, activate from webhook, billing period instead of calendar
      month, cancel at period end, invoices from the provider. Confirm Pro/Business prices with the user.
- [ ] Account area to connect other channels: create/rotate MCP tokens, link a Telegram account (one-time code).
- [ ] Needs from backend: user accounts/auth (replace shared API_KEY; then the website proxy must check the signed-in
      user instead of injecting one key). Until then the website must not be deployed publicly.

### Phase 6 — Publishing (Buffer)
- [ ] Buffer GraphQL `createPost` with video `url` (must be publicly reachable) + `schedulingType`/`mode`/`dueAt`.
- [ ] Decide auth: Buffer docs mention OAuth for third-party apps; MVP fallback = user pastes personal Buffer key.
- [ ] Signed links last ≤7 days → issue a fresh link when sending to Buffer; confirm whether Buffer copies media.
- [ ] **Prerequisite for a real test:** Buffer fetches the video from its URL over the internet, so `dev.py`'s fake S3
      (`127.0.0.1:9000`) can't be used; needs the live R2 bucket (token permission, see Immediate) or a mocked Buffer.
- [ ] Spec §22 suggests a `PublishingProvider` interface; project rule is no interface with one implementation → one
      `publishing.py` service with Buffer functions (swap the module later). §46 tests: OAuth failure, expired token,
      rate limits, publishing failure, scheduled post. Only approved clips should be publishable; publishing status
      shown per clip. Scheduling many clips over days is Phase 7 (calendar).

### Phase 7 — Content calendar
- [ ] Frequency/days/times/start date/platforms → distribute approved clips; list-style calendar UI; calendar.csv.

### Phase 8 — MCP (`apps/mcp` or inside backend — decide here)
- [ ] Official `mcp` Python SDK, Streamable HTTP at `/mcp`, authenticated with per-user tokens issued on the website;
      high-level tools (repurpose_video, get_project_status, list_projects, generate_content_package,
      create_content_calendar, schedule_content) calling `jobs.py` services; same limits as the website.

### Telegram bot (planned channel, after MCP)
- [ ] Bot calls the same backend services; users link Telegram to their website account (one-time code); no payments
      in the bot — unsubscribed users get a link to the website.
- [ ] Flow: send a video link (or file) → project created → bot reports progress → sends clips/links + post copy.
- [ ] Check Telegram Bot API limits at build time (cloud Bot API: bots download files ≤20 MB, upload ≤50 MB), so large
      videos go via link or website upload, and clips may need to be sent as signed links.

### Phase 9 — Billing & usage
- [x] Plans + monthly limits for one workspace, enforced in backend services (2026-09-14, see Done).
- [ ] Users/workspaces (give `subscriptions` and `projects` an owner; proxy checks the signed-in user), per-job cost
      tracking (§33: STT seconds, LLM tokens from `usage`, render seconds, storage bytes, publishing ops), overage.
- [ ] When payments go live: subscription state from the provider's webhooks (see Phase 5 "Real payments").

### Phase 10 — Hardening + deploy
- [ ] Railway deploy: Dockerfile/image with ffmpeg + Node/Deno + fonts; Railway Postgres `DATABASE_URL`; separate
      API and worker services.
- [ ] Tests from masterprompt §46 still missing: long videos, multilingual, no speech, 4:3 / 9:16 sources, multiple
      speakers, provider timeouts, duplicate jobs, malformed files, rate limits.
- [ ] YouTube bot-wall from datacenter IPs (cookies/residential proxy) — upload path is the fallback.

### Known ceilings (`# ponytail:` notes in code)
- Face tracking follows the largest face (not active speaker); hard-cut shots can look jumpy on handheld footage.
- Thumbnail = frame at 1 s; can miss the speaker when a clip opens on B-roll.
- A worker stalled > 2 min without crashing can cause a job to run twice (add a claim token if seen).
- One DB connection per call (add psycopg_pool when latency shows it); fixed worker concurrency.
- Source URL DNS checked once (rebinding); shared API key.
- Website proxy injects the one backend key for anyone who can reach the site (bound to 127.0.0.1 until accounts).
- Billing: one workspace; calendar-month usage; running projects don't reserve allowance (a month can overshoot by one
  video); minutes = speech length of completed projects; ZIP bytes flow through the API server.
- STT fallback when needed: onnx-asr + Parakeet v3 on CPU (~$0.01/audio-hr, European languages only).

## Lessons learned / gotchas
- **ffmpeg segment muxer + FLAC**: pieces keep global frame numbering; the last piece's header claimed the full stream
  length → Groq 500 every time. Encode each chunk separately (`-ss/-t`). Also force `-sample_fmt s16` (float
  sources become 24-bit FLAC, ~23 MB per 10 min, near Groq's 25 MB cap).
- Groq 500s are not always transient — isolate the failing chunk before blaming the provider.
- **yt-dlp as a library defaults to 0 retries** (CLI sets 10) and now needs a JS runtime for YouTube.
- YouTube often serves AV1 by default → very slow CPU decode (OpenCV + ffmpeg); `format_sort` prefers h264.
- **libass/ffmpeg filter args on Windows**: drive colons break parsing → run ffmpeg with `cwd` = output dir and pass
  relative paths (`ass=clip01.ass:fontsdir=../../fonts`).
- Windows maps `.ass` to `audio/aac`; set content types explicitly.
- `pydantic` field named `copy` shadows BaseModel → used `posts`.
- moto rejects region `auto` on CreateBucket only (create the test bucket with us-east-1).
- The Windows `curl` fails on cert revocation checks here; use Python `urllib` for downloads.
- **Avast Web Shield intercepts HTTPS on this PC** (re-signs certs with "Avast Web/Mail Shield Root", trusted only in
  the Windows store). Python stdlib/openai work; **boto3 fails with CERTIFICATE_VERIFY_FAILED** because it uses
  certifi. Fix (this PC only, no code change): `C:/Users/USER/.certs/ca-bundle-with-windows-roots.pem` (certifi +
  Windows ROOT store via `ssl.enum_certificates`) set as `AWS_CA_BUNDLE` in `.env`. Regenerate if Avast's root changes.
- Network here is flaky (pip/SSL timeouts): retry installs; keep downloads resumable.
- `openai` 3.x uses `httpx2` (plain `httpx` isn't installed) — use `urllib` for ad-hoc HTTP scripts.
- **Avast got stricter during 2026-09-14 (afternoon):** (1) local HTTP responses > ~1–2 MB stall on the last ~64 KB
  and reset after 19 s (`WinError 10054`), reproduced with Python's own `http.server`, so moto/`dev.py` can't hand
  uploads or clips back (worker `storage.get` → `RetriesExceededError`; ≤300 KB fine); (2) yt-dlp now fails with
  `CERTIFICATE_VERIFY_FAILED` (certifi vs Avast's re-signed certs). Not code bugs; don't "fix" in code. Fix on the PC:
  Avast Web Shield exceptions for `127.0.0.1`/`localhost` and HTTPS scanning, or pause it while testing.
- **npm behind Avast:** `UNABLE_TO_VERIFY_LEAF_SIGNATURE` → run npm/npx with
  `NODE_EXTRA_CA_CERTS=C:/Users/USER/.certs/ca-bundle-with-windows-roots.pem`.
- **Headless Edge screenshots** (`msedge --headless=new --screenshot`): follows the Windows dark theme (force with
  `--blink-settings=preferredColorScheme=1` light / `0` dark); window width can't go below ~500 px (narrow shots look
  clipped on the right: artifact); `--virtual-time-budget` is needed for client-fetched data but can hang on stalled
  media requests (wrap in `timeout`); iframes don't wait for data. One `--user-data-dir` per concurrent instance.
- `next start` launched via `npx` leaves the node child alive after TaskStop → kill the process listening on :3000
  before restarting, and never rebuild under a running server.
- **Driving a real browser without Playwright:** `apps/website/walkthrough.mjs` starts headless Edge with
  `--remote-debugging-port` and talks DevTools protocol over Node 24's built-in `WebSocket` (Runtime.evaluate to click/
  type, `DOM.setFileInputFiles` for uploads, `Emulation.setDeviceMetricsOverride` for true 390 px, `setEmulatedMedia`
  for dark mode, `Page.setDownloadBehavior` for downloads). Wait for client-fetched text before clicking (race seen).
  Set React inputs via the native value setter + `input` event. Headless clipboard writes fail even after
  `Browser.grantPermissions` (browser-level socket) + focus emulation.
- With Avast active, a worker job on an uploaded tone video sat in "analyzing" > 10 min (DeepSeek call apparently hung
  behind HTTPS interception); one worker = whole queue waits. Cause not confirmed.
- Next.js 16 ships its docs in `apps/website/node_modules/next/dist/docs/` (route handlers take
  `RouteContext<"/api/[...path]">`, params are Promises, `middleware` is now `proxy`).

## User preferences
- Wants ponytail-style minimal solutions and honest, plain-English status (what works, what wasn't verified).
- For website/UI work also use the design skills (asked 2026-09-14): `impeccable`, `ui-ux-pro-max` (not a registered
  slash skill: read `~/.agents/skills/ui-ux-pro-max/SKILL.md`, search script `scripts/search.py`) and
  `design-taste-frontend` (installed globally 2026-09-14). They conflict with each other and with ponytail in places
  (icon libs, Motion/GSAP, stock images, indigo palettes); the project brief + ponytail win, use their checklists.
- Keys: GROQ, DEEPSEEK, BUFFER in `apps/backend/.env` (user pastes them; never echo). R2 credentials pending.
