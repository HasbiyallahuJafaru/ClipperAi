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

### Repo (2026-09-14)
- Pushed to https://github.com/HasbiyallahuJafaru/ClipperAi (public, `main`, first commit 402473e) with README,
  `.env.example`, description and topics. Layout: `apps/backend`, `apps/website` (empty), `apps/mcp` (empty).
- Second push: `.claude/CLAUDE.md` (goal, channels, rules) + this memory file, and a full root README (how it works,
  setup, configuration, API reference with examples, retention, reliability, security, costs, troubleshooting,
  roadmap). The code has no license file yet — user to decide.

## Left

### Immediate
- [ ] **Live R2 test**: user creates bucket + API token, fills `S3_*` in `apps/backend/.env`; then run
      `storage.py setup`, an upload project and a YouTube project end to end; push fixes.
- [ ] Upgrade Groq to Developer plan before real customers (free plan: 20 req/min, 7,200 audio-s/hour,
      28,800 audio-s/day shared across all customers).

### Product direction (decided 2026-09-14, beyond masterprompt.md)
- Three access channels on one account/subscription/usage balance: **website**, **MCP**, **Telegram bot** (planned).
- **Payments happen only on the website** (subscriptions). MCP and Telegram use the product; they never take payment.
- MCP location: `apps/mcp` if it needs its own deployable, else inside the backend (default). Decide in Phase 8.
- Limits/subscription checks enforced once in backend services so every channel gets identical rules.

### Phase 5 — Next.js website (`apps/website`)
- [ ] Pages per masterprompt §39: landing, dashboard, new project (paste URL / upload), project status/results,
      clip library with preview + edit/approve/reject + batch actions, calendar, settings (integrations, brand, usage).
- [ ] **Subscriptions + payments** (pricing page, checkout, manage/cancel plan, billing history) and **usage view**.
      Payment provider not chosen yet — decide before building (hosted checkout + webhooks, no card data on our servers).
- [ ] Account area to connect other channels: create/rotate MCP tokens, link a Telegram account (one-time code).
- [ ] Needs from backend: user accounts/auth (replace shared API_KEY), clip approve/reject/edit fields, delete project,
      ZIP/content-package download (§42), maybe batch project submission (§43).

### Phase 6 — Publishing (Buffer)
- [ ] Buffer GraphQL `createPost` with video `url` (must be publicly reachable) + `schedulingType`/`mode`/`dueAt`.
- [ ] Decide auth: Buffer docs mention OAuth for third-party apps; MVP fallback = user pastes personal Buffer key.
- [ ] Signed links last ≤7 days → issue a fresh link when sending to Buffer; confirm whether Buffer copies media.

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
- [ ] Users/workspaces, plans and limits (masterprompt §32), per-job cost tracking (§33: STT seconds, LLM tokens from
      `usage`, render seconds, storage bytes, publishing ops), overage handling.
- [ ] Subscription state comes from the payment provider's webhooks (website payments); enforced in backend services
      for all channels (website, MCP, Telegram).

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
- Network here is flaky (pip/SSL timeouts): retry installs; keep downloads resumable.
- `openai` 3.x uses `httpx2` (plain `httpx` isn't installed) — use `urllib` for ad-hoc HTTP scripts.

## User preferences
- Wants ponytail-style minimal solutions and honest, plain-English status (what works, what wasn't verified).
- Keys: GROQ, DEEPSEEK, BUFFER in `apps/backend/.env` (user pastes them; never echo). R2 credentials pending.
