# Build memory

Last updated: 2026-09-16 (session 8: payments live (ZoomGuru/Paystack, NGN, 30-day plans), rate limiting + Railway
Redis, everything deployed, new APK). Update after every milestone: move items from "Left" to "Done" with how they
were verified.

## At a glance
- **Built:** engine, jobs/worker, R2 storage, website (submit, review, ZIP, pricing/billing with **live payments**),
  publishing through Buffer, content calendar, **Clerk accounts (sign-in/up, protected pages, backend token checks,
  every project/plan/post owned by a Clerk org or user)**, **payments (ZoomGuru/Paystack, USD prices charged in
  Naira, 30 days per payment)**, backend rate limiting (Redis). Channels: **website + Flutter mobile app only** (MCP
  scrapped 2026-09-15).
- **Pushed:** everything, incl. Clerk accounts + Next 16.3.5 patch (2026-09-15, commit "Accounts with Clerk...").
- **Website redesign done and pushed** (bf42176 + serif heading accent 5f7e3af, 2026-09-15, see Done). **Next:**
  Phase 8 **Flutter mobile app** in `apps/mobile` (backend on Railway) → per-account publishing connection → Phase 9 cost tracking (+ payments when asked) → Phase 10 deploy +
  hardening. Pricing proposal waiting on the user (see Done: pricing report).
- **Not proven on real services:** a full project end to end on real R2 (Avast blocks it here), Instagram posting,
  recovery from a real Buffer 429, a real person signing up through Clerk in a normal browser.

## Done

### Phase 0 — Research (2026-09-14)
- `DECISIONS.md`: component/license/cost table. Key picks: yt-dlp, Groq Whisper turbo ($0.04/audio-hr), DeepSeek
  (`deepseek-flash`, `deepseek-v4-pro`, OpenAI-compatible), FFmpeg CLI, OpenCV + YuNet face model (MIT), hand-written
  ASS captions, boto3 → R2, Buffer GraphQL API, official `mcp` SDK (MCP later scrapped), Postgres queue.
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

### Phase 6 — Publishing through Buffer (2026-09-15, pushed)
- Research (live, read-only): Buffer GraphQL schema by introspection. Account has **0 channels**. Third-party OAuth
  app registration reported closed; docs: "Your API key acts on behalf of your account only". **Buffer fetches media
  when the post goes out** and warns against signed/expiring URLs. Limits 100 req/15 min (429 + Retry-After).
- Decisions: auth = the workspace's `BUFFER_API_KEY` in `.env` (defaulted; rule "secrets only in .env"; no key form,
  no DB-stored tokens until accounts); post now or at a time for one clip (batch = Phase 7); only the six networks we
  write copy for (`twitter` → `posts.x`). **Media (user chose, after live tests showed Buffer can't read signed
  links):** separate public R2 bucket `clipperai-published` (its r2.dev address is in `.env` as `S3_PUBLIC_URL`; custom domain
  before launch; enabled via Cloudflare API `PUT /accounts/{id}/r2/buckets/{name}/domains/managed`);
  `storage.public_copy` server-side CopyObject to `<publication id>.mp4` per post; `publishing.save` deletes it when
  status becomes sent/error, `remove` and NOT_FOUND delete it too; 45-day lifecycle backstop; scheduling up to 30 days
  (`AHEAD`); `.env`: `S3_PUBLIC_BUCKET`, `S3_PUBLIC_URL` (publish refuses without them). User rejected streaming
  through the backend (server cost).
- `migrations/005_publishing.sql`: `publications` (one row per clip×channel; row inserted before Buffer is called;
  partial unique index `(project_id, clip_idx, channel_id) where status <> 'error'` stops double posting; status mirrors
  Buffer: sending/scheduled/sent/error/draft/needs_approval). `publishing.py`: `call` (urllib; 401/429/5xx/network/
  GraphQL errors → `PublishError(message, status, code)`), `channels` (orgs → channels, `usable`), `publish`
  (approved + live files + time window + usable channels + not already on channel → createPost per channel with
  per-network input: YouTube `metadata.youtube.title[:100]`, Instagram reel + shouldShareToFeed, Facebook reel,
  thumbnailOffset 1000 on TikTok/Instagram, `needsApproval: false`; a refused channel is saved as error and the rest
  continue; key/limit/network trouble stops), `publications` (re-checks posts whose time has come, ≤1/min each; NOT_FOUND
  → row deleted; Buffer errors swallowed so the page loads), `remove` (deletePost for scheduled; local delete for
  failed; refuses sent/sending). `jobs.delete_project` refuses while posts still have to go out. API: `GET
  /api/publishing/channels`, `POST /api/projects/{id}/clips/{idx}/publish` (201), `GET /api/projects/{id}/publications`,
  `DELETE /api/publications/{id}` (204); one exception handler maps `PublishError.status`. `fake_buffer.py` (answers in real shapes, enforces required inputs, `fail` switch) used by `test_jobs.py`
  and `dev.py --fake-buffer`.
- Website: approved clips with live files get **Publish** → inline form (channels with reasons: already posted/
  scheduled, reconnect in Buffer, locked, can't post here yet; Now/Later with native datetime-local min/max from
  `schedule_until`) → per-clip **Posts** list (Posting..., Scheduled for, Posted + View post, Didn't post: reason;
  Unschedule/Dismiss). Publications polled every 20 s while something is due (`usePoll` gained `reload()`); channels
  loaded once per page on first open. `/settings/integrations` ("Publishing" in nav): connection state, channel list.
- Verified: `test_jobs.py` ok (no key, wrong key, usable flags, approve-only, past/too-far times refused without
  Buffer calls, unknown/disconnected channel, per-network inputs, 7-day link downloads, duplicate refused, scheduled
  input exact, status refresh throttle + future posts not queried, sending→sent, failure at send time, queue-limit
  refusal then retry, rate limit at lookup and mid-publish (row recorded, later channels not tried, page still loads),
  revoked key, 503, unreachable, unschedule, dismiss, deleted-in-Buffer disappears, delete-project guard, expiry
  window, cascade); `test_clipper.py` ok; `next build` ok; `node check.mjs` ok (new routes 404/422 before Buffer);
  `walkthrough.mjs` against `dev.py --fake-buffer` passed end to end (Publishing page 4 of 6 ready, one Publish button
  (rejected clip has none), post now TikTok+YouTube, schedule X 2 days ahead, unschedule); screenshots light/dark/
  390 px checked once, fixed (row alignment, truncation, phone stacking, tap targets), re-checked; impeccable
  detector: no findings. **Every createPost input (6 networks × now/scheduled), post query and deletePost sent to the
  real API** against a non-existent channel: all "Channel not found" (schema-valid, nothing posted). Real key lists 0
  channels. Dev DB cleaned afterwards (4 old projects, no plan).
- **Real post verified (2026-09-15, user-approved):** scratch script doing exactly what `publish` does (4 s 1080×1920
  test clip in `clipperai` → `public_copy` → `post_input` + `privacy: private` for the test only → createPost) to
  YouTube "The Micro-Fix": `shareNow` came back **`sent` synchronously** with `dueAt` = now, `sentAt` +1.5 s,
  `externalLink` https://www.youtube.com/watch?v=uVqdDp9WFvc, `sharedNow: true`; both test files deleted after. (The
  private video stays on the channel; the user deletes it in YouTube Studio.) After the switch to public copies:
  `test_jobs.py` ok (plain public link per post, copies deleted on sent/failed/refused/rate-limited/unscheduled/deleted
  in Buffer, copy gone before send → post fails, no copies left, missing config refused, 30-day window), `check.mjs`
  ok, `walkthrough.mjs` ok against `dev.py --fake-buffer` (fake S3 public bucket via bucket policy), dev DB cleaned.
- **Website against real Buffer + R2 verified (2026-09-15, user said "test this", public posts OK):** scratch
  `real_fixture.py` (2 test clips 1080×1920 6 s, project in local dev DB, files in real `clipperai`) + `uvicorn
  api:app` (real .env) + `npm run start` + scratch `real_publish.mjs` (headless Edge, DevTools). Results: Publishing
  page listed both channels; clip 1 **Post now** → YouTube `sent` + public link, Instagram refused by Buffer
  ("Instagram personal profile channels require notification scheduling.", channel `type: profile`, descriptor
  "Personal Account") → **`channels()` now marks personal Instagram profiles unusable**, UI reason "Needs an Instagram
  creator or business account" (fake Buffer has such a channel + refusal; test_jobs + walkthrough cover it); after the
  restart the page and the clip 2 form showed that reason; clip 2 YouTube **scheduled for tomorrow → Unschedule**
  (real deletePost, row gone) → **scheduled 5 min ahead** → Buffer `sent` 2 s after dueAt, page showed "Posted 6:54 AM"
  + View post (backend refresh after due time). Public bucket empty afterwards (copies deleted on sent/error/
  unscheduled); test project deleted (R2 main bucket empty). Then `check.mjs` + `walkthrough.mjs` (fake Buffer, now
  "4 of 7 channels") ok, `test_clipper.py` + `test_jobs.py` ok, dev DB cleaned. Public test videos on "The Micro-Fix":
  watch?v=NbWBjHIFG2M and watch?v=VHLmTNy7Ex8 (plus the earlier private uVqdDp9WFvc): user deletes them.
- **Not verified:** Instagram posting for real (needs a creator/business account), TikTok/Facebook/X/LinkedIn on real
  channels (Facebook reels on Pages/Groups); real 429 headers; r2.dev rate limits under load.

### Phase 7 — Content calendar (2026-09-15, pushed in 39d434c)
- Design (ponytail): no new table, no migration. A calendar post is a `publications` row with `status = 'queued'`
  (no Buffer id) that the worker hands to Buffer; the calendar view is the project's publications grouped by day.
- `publishing.py`: `Calendar` (channels, days 1–7 ISO, times ≤6, start date, IANA `timezone` validated with
  `zoneinfo`); `slots` (weekday × time from `start` in that zone, DST-correct, between now + `EARLIEST` 30 min and
  `schedule_until`); `plan` (approved clips with no non-error post, clip order, skips times any chosen channel already
  has a post at across projects, so a second calendar continues after the first; `left` = clips that didn't fit;
  refusals: expired, nothing approved/everything scheduled, no time in window 422); `schedule` (plan + `ready()` channel
  check + one transaction of `insert ... on conflict (project_id, clip_idx, channel_id) where status <> 'error' do
  nothing`); `send_queued` (claims the soonest queued row `FOR UPDATE SKIP LOCKED` → `sending`; due < 1 min → error
  "couldn't be handed to Buffer before its time"; public copy + createPost like `publish`; **PublishError caused by
  `TimeoutError` = Buffer received it but never answered → error, never retried (double post)**; any other failure →
  back to `queued` and re-raised); `ready()` extracted from `publish` (public bucket config + channels lookup + usable);
  `remove` deletes a queued row only if still queued (else "being handed to Buffer right now").
- `jobs.work` starts a `send_posts` thread (sleep 5 s when idle, 60 s after any error); `import publishing` inside
  `work()` (publishing imports jobs). `content_package` adds `calendar.csv` (every post: due_at UTC, clip_idx, title,
  network with twitter→x, channel_name, status, external_link, error). API: `POST /api/projects/{id}/calendar/plan`,
  `POST /api/projects/{id}/calendar` (201). `requirements.txt` + `tzdata`.
- Website: `/projects/[id]/calendar` (form: channels via shared `ChannelChoices`, weekday toggles = sr-only checkboxes
  in labels styled with `has-checked:` like pressed buttons, times list with Add/Remove, start date, "In your time zone,
  X"; Preview → day-by-day list + "Schedule N posts"; any form change drops the preview; "Scheduled and posted" list
  grouped by day, then by displayed minute + clip, rows = `PostList compact`). Project page: "Schedule all" (approved
  clips not on the calendar) else "Calendar" when posts exist. `waiting` includes queued; state "Scheduling...".
- Verified: `test_jobs.py` ok (validation incl. path-like zones; plan checked against a brute-force half-hour scan in
  Asia/Tokyo; later start; window edge + `left`; >30 days 422; schedule makes 2 Buffer calls only; duplicates refused;
  publications() doesn't ask Buffer about queued rows; delete guard; remove queued without Buffer; rate limit →
  requeued; worker creates each post with its exact dueAt + public copy; refusal, no-answer timeout (not resent), missed
  time; a later clip skips TikTok's busy times; calendar.csv rows/order; expired refusal; cleanup leaves no copies).
  Mutation check: removing the busy-time filter fails the test. Scratch probes: `TimeoutError` vs `URLError` causes from
  `call()`; zoneinfo DST (New York 09:00 → 13:00/14:00 UTC). `test_clipper.py` ok; `next build` ok; `check.mjs` ok (new
  routes 404/422, calendar page 200); **`walkthrough.mjs` passed end to end** against `dev.py --fake-buffer` (clip 2
  un-rejected + approved → Schedule all → Instagram + X, Mon/Wed/Fri, 09:00 + 18:00 → preview "Clip 02 / Instagram, X"
  → toggling a day drops preview → Schedule 2 posts → worker → both `scheduled` Wed 09:00 local → package has
  calendar.csv → Unschedule both → form returns). Screenshots light desktop/preview + dark 390 px checked; fixed
  "post now" posts seconds apart showing as two entries; re-checked. impeccable detector: no findings. Dev DB cleaned
  (back to 4 old projects, no plan, no publications).
- **Real Buffer + R2 verified (2026-09-15, user said "lets test this"):** scratch `real_fixture.py` (project A 1 clip,
  project B 30 clips, 5 s 1080×1920 test video on real `clipperai`, all approved, text "ClipperAi calendar test") +
  `uvicorn api:app` + separate `python jobs.py` worker + `npm run start` + scratch `real_calendar.mjs` (headless Edge):
  calendar page → YouTube "The Micro-Fix", all days, 09:00 Africa/Lagos, start +3 days → Preview → Schedule 1 post →
  worker created it in Buffer ~3.5 s later (`scheduled`, dueAt 2026-09-18T08:00:00.000Z, calendar text; public copy in
  `clipperai-published`) → page showed "Fri, Sep 18 · 9:00 AM · YouTube · The Micro-Fix · Scheduled" → Unschedule on
  the page → Buffer `post` NOT_FOUND, public bucket 0 objects, nothing waiting in Buffer. Buffer's `posts` query
  filters by `status` (`posts(first, input: {organizationId, filter: {status: [scheduled, ...], channelIds}})`).
- **30-post batch against real Buffer (2026-09-15, user said "run the real buffer test"):** `real_batch.py` scheduled
  project B's 30 clips on YouTube (all days, 08:00–18:00 every 2 h Africa/Lagos, from Sep 18) through the real API;
  schedule answered 201 in 5.8 s; the separate worker handed all 30 to Buffer in ~101 s (~3.4 s each), no exceptions
  in its log. **Buffer's plan caps scheduled posts: 10 accepted, 20 refused with "Scheduled posts limit reached. You
  have 10 scheduled posts out of 10 allowed."** (recorded as `error` rows with that reason; per channel or per account
  not checked). Improvement to consider: stop sending the rest of the queue for that channel after this refusal (saves
  requests) and say it on the calendar page before scheduling more than the plan allows.
- **Blocked, not verified:** the real 429 test. After the batch, the permission classifier denied every further command
  in the flow ("Real-World Transactions"), even read-only checks (Buffer post list, local DB query). Worker stopped;
  API left running on :8000 for cleanup. Scripts in the session scratchpad: `real_cleanup.py <project>...`
  (unschedules through the API, deletes projects, checks Buffer + buckets empty), `real_limit.py`, `real_watch.py`.
- **Cleanup done (2026-09-15, user asked):** `real_cleanup.py` through the real API: 10 scheduled posts unscheduled
  (204, Buffer deletePost), 20 failed rows dismissed, both test projects deleted (204), storage prefixes 0 files,
  public bucket 0 objects, Buffer `posts` with status scheduled/sending/needs_approval/draft: 0. API and worker stopped.
  Dev DB is back to the 4 old projects.

### Scrapped: Telegram bot and command-line tool (2026-09-15, user decision)
- Telegram existed only as a plan (docs, one `billing.py` docstring): removed from CLAUDE.md, README, handover, memory.
- CLI removed from `clipper.py`: `main()`/argparse, and the defaults only it used (`WORK` = `work/` download cache,
  `disk_transcript`/`save_disk_transcript`, `out/<source key>` default, printing progress). `run()` now takes
  `progress`, `load_transcript`, `save_transcript`, `work_root` as required keyword arguments (the worker passes them);
  `acquire(source, root)` needs `root`. `jobs.run_job` passes them by name; `test_clipper.py` passes them too.
- Left on disk, untracked: `apps/backend/out/` (30 MB, old CLI clips) and `work/` (185 MB, downloaded YouTube videos +
  transcripts); still in `.gitignore` so they can't be committed. Delete them when the user agrees.
- Verified: `test_clipper.py` ok, `test_jobs.py` ok after the change.

### Pricing and capacity report (2026-09-15)
- Published privately: https://claude.ai/code/artifact/40731d89-cffa-4ab6-b520-a6dd461435ff (source HTML + scratch
  `bench.py`/`costmodel.py` in the session scratchpad). Live competitor research (OpusClip $15/150 min, $29/300 min;
  Vizard $29/600 min; quso $49/600; Klap $29/$79/$189 by clips; Choppity $32/5 h; Munch $49/200 min; 2short $19.90/15 h;
  Descript, Riverside, Submagic). **OpusClip already runs an MCP server** (28 tools, OAuth).
- Measured on our engine (Ryzen 3 5450U, 8 threads): H.264 1080p source → **3.3 CPU-s per clip-second** (0.48 wall-s),
  ~0.7 GB RAM per render; AV1 source 5.6 CPU-s (face tracking decodes every frame). Audio prep 4.7 CPU-s per 25 min.
  DeepSeek tokens per video-hour: flash 18.2k in / 0.8k out, v4-pro 6.7k in / 3.7k out (≈ $0.03 peak).
- Unit cost ≈ **$0.107 per source video-hour** (STT $0.04, LLM $0.03, Railway compute $0.014, R2 $0.003, egress to R2
  + one ZIP $0.02); plan with $0.16. YouTube via residential proxy adds $0.20–5.00/h depending on download approach.
- Proposed (not decided): Free 60 min (watermark, sign-in) · Starter $12/6 h · Creator $24/20 h (incl. MCP, now scrapped) · Agency
  $59/60 h; no clip caps; annual = 2 months free; extra hours $1.50. Margins ~78–83% at full use, ~88% at 40% use.
  Alternative: $29 for 30 h. Current `billing.py` plans unchanged until the user decides.
- Capacity: 1 h video ≈ 8 min on 8 vCPU; ~11 video-hours/hour per replica (2 jobs). Launch blockers found: Groq free
  plan (8 video-hours/day total), one Buffer account for everyone (Buffer free: 10 scheduled/channel, 3,000 API
  requests/month), no sign-in (now done), YouTube blocks cloud IPs, ZIP streamed through the API (Railway 5-min request
  limit per its forum), r2.dev public bucket; later: FIFO queue fairness, DB pool + transcript retention, Railway egress
  ($0.05/GB) at ~10k users. Clerk: free to 50,000 MRUs; Pro $25/mo.

### Accounts with Clerk (2026-09-15, pushed)
- User decision: Clerk for everything around accounts (see CLAUDE.md). Clerk CLI 3.3 installed globally (npm), logged in
  with the user's Clerk account, `clerk init --app app_3JMJIEqTu79eUjLFgFDsRzpNa7h -y --no-skills` in
  `apps/website` (development instance "Clipper ai"; production not configured). `clerk doctor`: all green.
- npm audit during init: **Next 16.3.2 critical RCE advisories** → upgraded to **16.3.5** (exact), 0 vulnerabilities.
- Website: `proxy.ts` (`clerkMiddleware`; public `/`, `/pricing`, `/sign-in(.*)`, `/sign-up(.*)`, `/api(.*)`; others
  `auth.protect()`; matcher + `/__clerk/:path*`), `layout.tsx` (`ClerkProvider` in body with ink/inherit/radius
  variables; nav: signed-out Pricing + Sign in + Sign up (btn-primary), signed-in Projects/Publishing/Pricing/Billing +
  `UserButton`), sign-in/up pages, `/api` proxy: `await auth()` → 401 "Sign in to continue." else forwards `Bearer
  await getToken()` (no more BACKEND_API_KEY). Scripts bind **localhost** (see gotchas). `.env.example` updated.
- Backend: `migrations/006_owners.sql` (`projects.owner`, `subscriptions.owner`, one active plan per owner);
  `api.signed_in` = `clerk_backend_api.security.authenticate_request(accepts_token=["session_token"],
  authorized_parties=CLERK_AUTHORIZED_PARTIES or 127.0.0.1/localhost:3000)` → owner `org_id or sub`; every route takes
  `Owner`; `API_KEY` removed. `billing.*`, `jobs.*`, `publishing.*` take `owner` first and filter by it (update_clip
  via subquery, remove via join, worker uses `project["owner"]`, `send_queued` reads the clip row directly).
  `publishing.allowed(owner)`: `BUFFER_OWNERS` (Clerk ids, comma-separated, `*` = anyone; `dev.py --fake-buffer` sets
  `*`) gates `channels`/`ready` because the workspace Buffer key posts to one person's socials. `requirements.txt` +
  `clerk-backend-api>=7,<8`. Backend `.env`: `CLERK_SECRET_KEY` copied from a temp `clerk env pull` file without
  printing; `SSL_CERT_FILE` (this PC).
- Tests/tools: `test_jobs.py` uses owners ME/OTHER with isolation checks (other account: no plan, can't get/list/edit/
  package/cancel/delete my project, can't see/remove my posts or plan/schedule my project, usage separate, BUFFER_OWNERS
  refusal). Mutation check: turning the owner filter in `get_project` into `or` fails the test. `check.mjs` = signed-out
  checks (API 401 on 6 routes, CSRF 403, `/` `/pricing` `/sign-in` `/sign-up` 200, 7 private pages 307 → /sign-in).
  `dev_fixture.py` creates/reuses Clerk test user `walkthrough+clerk_test@example.com` (username `walkthrough_test`),
  owns the project, prints a one-hour sign-in ticket; `walkthrough.mjs` step 0 checks the signed-out wall then signs in
  via `/sign-in?__clerk_ticket=...`, API assertions run in-page (session cookie), signed-in 404/422 checks moved here.
- Verified: `test_jobs.py` ok, `test_clipper.py` ok, `next build` ok, `clerk doctor` ok, `check.mjs` ok, backend curl
  without/with bogus token → 401, **`walkthrough.mjs` passed end to end signed in** (every flow incl. billing per user,
  batch links/uploads, review, ZIP, publishing via fake Buffer, calendar, cancel plan). Screenshots: Clerk sign-in card
  matches (ink button, system font), signed-in header with UserButton, 390 px dark OK. Dev DB cleaned (test user's 6
  projects, 2 posts, 2 plans deleted; the 4 old projects have no owner so nobody sees them).
- **Not verified:** a real person signing up (email code, Google/Apple) in a normal browser; Clerk Organizations
  switching (owner = org_id path untested with a real org); Clerk components in dark mode (card stays light).

### Website redesign after the "Relink" reference (2026-09-15, pushed in bf42176)
- User answers: sample clips = placeholder gradient frames (no generated people until a video we own); plan prices
  **copied** into `apps/website/app/plans.ts` (no public backend route); **light only**; then mid-build: **each nav link
  its own page** (home = hero + composer + preview only).
- Look: sky photo (Unsplash xtgONQzGgOE, `app/(site)/sky.jpg`), ground #f4f6fa, accent #2355f5, Geist (vendored woff2),
  Phosphor icons (new npm dep), pill buttons, 16/24px cards. Details: `DESIGN.md`; deps + licence: `DECISIONS.md`.
- Structure: route groups `app/(site)` (/, /how-it-works, /features, /pricing, /faq, sign-in/up; public in `proxy.ts`)
  and `app/(app)` (sidebar shell: dashboard, projects, calendar, settings, checkout). URLs unchanged. Shared: `app/ui.tsx`
  (Logo, PageHeader, ClipFrame, PAGES), `app/(site)/sections.tsx`. Signed-out visitors can submit the composer: 401 now
  shows a Sign up link. Old Montserrat headings, yellow accent and the "no gradients" rule are gone.
- Verified: `next build` ok; `check.mjs` ok (7 public pages); **`walkthrough.mjs` passed end to end** (header/footer-only
  "Projects" check, new plans drift assertion); screenshots desktop 1440 + phone 390 of every marketing page (2 rounds,
  fixes: preview phone hid sidebar, Options wrap, empty blue card space, plan price alignment, heading break) and of
  review/calendar/billing/publishing/checkout/publish form; calendar post-row wrap fixed after the last screenshot
  (built, not re-screenshotted). impeccable detector: 1 false positive (tab underline). Dev DB: test user data deleted.
- Gotchas: a server component can't import a constant from a `"use client"` file (becomes a client reference: "PAGES.map
  is not a function" at prerender); Git Bash rewrites `/pricing` args to Windows paths (use `MSYS_NO_PATHCONV=1`);
  Node 24 imports `app/plans.ts` directly (prints a harmless module-type warning).
- Found in the dev DB, left alone: a project + Creator plan owned by `user_3JMPnCcS92s2JtVKOl6xJvWA1SC` (created
  2026-09-15 11:08 UTC, probably the user signing up).
- Not done: the skill's separate finish-reviewer/documenter agents and PRODUCT.md (DESIGN.md written by hand; product
  truth stays in CLAUDE.md/masterprompt.md); real clip frames; checking in a real (non-headless) browser.

### MCP scrapped, Flutter app planned, graphify, domain (2026-09-15, user decisions)
- MCP server scrapped; Phase 8 is now a **Flutter mobile app** in `apps/mobile` (user created the folder and removed
  `apps/mcp`). Backend on **Railway**; domain **`ytclipper.xyz`**. Docs updated: CLAUDE.md, masterprompt.md (§24–26
  mobile app, Phase 8, architecture, flows), README, DECISIONS (mobile, scrapped MCP, hosting, graphify), handover,
  phase0, this file. Flutter 3.47.1 / Dart 3.13.1 already installed.
- **graphify** (`graphifyy` 0.9.48, pip --user; CLI at `C:/Users/USER/AppData/Roaming/Python/Python312/Scripts/graphify`):
  `graphify update .` built 65 files → 687 nodes / 1,119 edges in ~7 s (code parsed locally, no AI calls). Checked: no
  `.env`/pgdata/media/dependencies in the map; `query`, `explain`, `path` answer correctly; `affected` needs a node id
  when a name exists in two files. Git hooks installed (post-commit, post-checkout rebuild); `graphify-out/` added to
  `.gitignore`; removed the `.gitattributes` merge rule it created (output isn't committed). CLAUDE.md no longer
  auto-imports this file (`@memory.md` removed): look things up with graphify, read only the matching section.
- New rule: every feature ends with tests + all relevant checks passing + `graphify update .` + memory update.

### Repo (2026-09-14)
- Pushed to https://github.com/HasbiyallahuJafaru/ClipperAi (public, `main`, first commit 402473e) with README,
  `.env.example`, description and topics. Layout: `apps/backend`, `apps/website` (empty), `apps/mcp` (empty).
- Second push: `.claude/CLAUDE.md` (goal, channels, rules) + this memory file, and a full root README (how it works,
  setup, configuration, API reference with examples, retention, reliability, security, costs, troubleshooting,
  roadmap). The code has no license file yet — user to decide.
- Third push (2026-09-14, end of session 2): everything in Phase 5 + billing above, `dev.py`, the `db.py` start lock,
  `check.mjs`, `walkthrough.mjs` + `dev_fixture.py`, updated README/DECISIONS/CLAUDE.md/memory/handover. The user
  clears the session after this push and starts Phase 6 in a new one (start from `handover.md`).

### Session 6 (2026-09-15): Phase 8 started, Railway + Vercel production checks
- **Decisions (user):** app sign-in with `clerk_flutter` beta; **Android first** (iOS code kept, no build route yet);
  app name **YT Clipper**, id **`xyz.ytclipper.app`**; **deploy the backend to Railway before trying the app**; the app
  follows the website's UI.
- **Backend:** `api.signed_in` now accepts Clerk tokens without `azp` (native app) and still rejects browser tokens from
  other sites (the SDK's `authorized_parties` rejected the app); check at the end of `test_jobs.py`. `GET /health`
  (no sign-in). `Dockerfile` (python:3.12-slim + ffmpeg + nodejs, non-root, proxy headers; worker via
  `START_COMMAND=python jobs.py`), `.dockerignore`, `railway.json` (Dockerfile builder, restart on failure),
  requirements pinned except yt-dlp.
- **Railway project `ytclipper`** (id 2f4eb11d-5b9f-468a-8139-27a52ac8c38c, env production): Postgres, `api`, `worker`.
  Set: `DATABASE_URL=${{Postgres.DATABASE_URL}}` on both, `START_COMMAND` on worker, `CLERK_AUTHORIZED_PARTIES` on api
  (`http://localhost:3000,https://ytclipper.xyz`, add the Vercel URL). Both images build and start; both **crash only
  because the secrets aren't set** (user to copy them; a scratchpad script `railway_env.py` does it without printing).
  **No public domain yet**: `railway domain --service api` was blocked by the permission check (user runs it).
- **Vercel project `website`** (root `apps/website`, https://website-pearl-seven-93.vercel.app): every page answered
  **500 because the project has no environment variables** (Clerk keys, `BACKEND_URL`). Code is fine for Vercel.
  Added security headers + `poweredByHeader: false` in `next.config.ts` (verified locally on `npm run start`).
- **Mobile app `apps/mobile`** (Flutter 3.47): `lib/main.dart` (website tokens as theme, Clerk themed, sign-in on the
  sky with Clerk's card, Logo, serif-accent Heading), `lib/api.dart` (Bearer token client, readable errors incl.
  offline/timeout, streamed upload with progress, release builds require `API_URL` + `CLERK_PUBLISHABLE_KEY`
  dart-defines), `lib/screens.dart` (projects list with 3 s polling, new project by link or phone video, project page
  with progress/cancel, clip cards: play, approve/reject, save or share, copy posts; plan and usage read-only, no
  purchases). Release signing from `android/key.properties` (gitignored), else debug key. `flutter analyze` clean,
  `flutter test` 7 passing (client, errors, upload, labels, projects list, clip approve + posts).
- **Not verified:** the app on an emulator/phone and a real Clerk sign-in from it (no emulator, SDK licences not
  accepted, and Gradle downloads fail behind Avast: Java needs `JAVA_TOOL_OPTIONS=-Djavax.net.ssl.trustStoreType=Windows-ROOT`,
  the user stopped that build); `walkthrough.mjs` (port 8000 held by an existing backend of unknown version).
- **Next:** publish now/schedule + calendar list + clip editing in the app; run it on an emulator against Railway.
- **Later in session 6 (2026-09-15):** secrets copied to Railway (api + worker, 11 each, names checked) and Vercel
  production (7 website keys; `BACKEND_URL=https://api-production-e0fc.up.railway.app`, `BACKEND_API_KEY` dropped).
  API domain created; `CLERK_AUTHORIZED_PARTIES` includes the Vercel URL. Both Railway services run; `/health` 200.
  **Vercel:** project is Git-linked (GitHub `main`), so website code only deploys on push; Deployment Protection is
  `all_except_custom_domains`, which puts the production `.vercel.app` URL behind Vercel login (changing it was blocked
  by the permission check: user switches it to "Only Preview Deployments" or adds `ytclipper.xyz`). A manual
  `vercel alias set` was needed after `vercel redeploy` left the alias on DEPLOYMENT_NOT_FOUND.
- **YouTube blocks Railway's IPs** ("Sign in to confirm you're not a bot"): now a PermanentError with a readable message
  (no retries); `YTDLP_PROXY` env routes yt-dlp through a proxy (residential proxy = the real fix, user to choose).
- **Progress + thumbnail (user request):** `jobs.present` adds `progress` (0-100 from stage + detail: download "37%"
  from yt-dlp hooks in 5% steps, "clip i of n") and `thumbnail` (YouTube links only, i.ytimg.com). Website: `ProgressBar`
  + `ClipLoading` (picture in a 9:16 frame, colour fills from the bottom) on the project page, thumbnail + bar in the
  projects list. App: same (`progressBar`, `ClipLoading`), failures show `detail`, never the raw `error`. Checks:
  test_jobs + test_clipper ok, next build ok, flutter analyze clean, flutter test 9 passing. Backend deployed with
  `railway up`; website changes need a push.
- **Rename + SEO (user, 2026-09-15):** brand is **YT-Clipper** everywhere user-facing (website, backend messages, app
  label/texts); repo, buckets and code names unchanged. OpenSEO project `YT-Clipper` (id edf5c12e-8d6c-4e9e-8d45-fe2bba23c9ec,
  US) holds the competitor list, positioning and research log. Findings: opus.pro leads (~201k visits, brand 90.5k/mo);
  wayin.ai/choppity.com win transactional terms with /tools/ pages; winnable: youtube clip maker 1.3k KD8, youtube
  shorts maker 1.3k KD15, clip youtube video 2.9k KD15, opus clip alternative 390 KD0, opus clip pricing 880 KD12.
  Built: `app/site.tsx` (SITE from SITE_URL / VERCEL_PROJECT_PRODUCTION_URL, JsonLd), root metadata (title template,
  canonical, OG/Twitter), `opengraph-image.jpg`/`twitter-image.jpg` (user's urlimg.png, 145 KB; its logo reads "YT
  Clipper"), `robots.ts`, `sitemap.ts` (13 URLs), `/compare` + `/compare/{opusclip,klap,vizard,submagic}` (data in
  `compare/data.ts`: dated prices, review complaints with our verified answers, where they win, sources),
  `/tools/{youtube-clip-maker,youtube-shorts-maker,podcast-clip-generator}`, FAQ grew to 15 questions (FAQPage JSON-LD),
  pricing "What every plan promises" + Offer JSON-LD, footer Tools/Compare columns, proxy.ts public routes (robots,
  sitemap, compare, tools), check.mjs covers them. Verified: next build, check.mjs, Playwright screenshots (user asked for
  Playwright: `npx -y playwright@1.55.0 screenshot --channel msedge`, no dependency added). Prices NOT changed (user decides).
- **App round 2 (2026-09-15):** `lib/publish.dart` (ClipEditor incl. hook, ChannelPicker, PublishSheet now/schedule
  up to 30 days, CalendarPage with post list + unschedule, ScheduleForm days/times/start with preview then schedule,
  phone zone via flutter_timezone); screens.dart: project calendar + delete actions, clip Edit/Publish (publish only
  approved + live), score + reason on clips, **fixed "Clip N" numbering (backend idx starts at 1)**, new-project
  options (clips, shortest/longest, captions switch, validated by `projectSettings`), share-to-app (text/* and video/*
  intent filters, singleTask; `shares()` in main.dart; iOS share extension not done). Launcher icons generated from
  the website logo (PIL). Look checked by rendering golden PNGs with real fonts (throwaway test, deleted). 13 tests.
- **Hook overlay removed + captions switch (user, 2026-09-15):** the black-box hook at the top of each clip is gone
  (ASS Hook style/event removed); hooks stay as editable copy (ClipEdit.hook, website + app editors). `NewProject.captions`
  (default true, stored in options; older projects default on) → `clipper.run(captions=)` → `render(burn=)`: the .ass
  file is always written, burned in only when on. test_clipper renders a real clip both ways and compares frames.
  Website: "Add captions" checkbox in Options, hook banner removed from sample ClipFrames/CSS, FAQ answer for videos
  that already have subtitles. Auto-detecting burned-in subtitles NOT built (would need OpenCV text detection on
  sampled frames; asked the user). Backend deployed with `railway up`.
- **Release APK built (2026-09-15):** `apps/mobile/build/app/outputs/flutter-apk/app-release.apk`, 59 MB, label
  YT-Clipper, `xyz.ytclipper.app`, minSdk 24 / target 36, API_URL = Railway, Clerk dev publishable key (read from
  `clerk apps list --json`, never printed), debug-signed. Two failures on the way: `receive_sharing_intent` 1.9.0 needs
  compileSdk 37 (AGP 9.1 supports 36) → pinned 1.8.1 (same API; analyze + 13 tests pass); 1.8.1 then failed Kotlin/Java
  target validation (Java 11 vs Kotlin 21) → `kotlin.jvm.target.validation.mode=warning` in android/gradle.properties.
  Gradle through Avast works with `JAVA_TOOL_OPTIONS=-Djavax.net.ssl.trustStoreType=Windows-ROOT`; SDK licences were
  accepted automatically by the build (platform 35 installed). NOT verified: installing/running on a phone.
- **Buffer per-user (open question 2026-09-15):** Buffer docs say OAuth 2.0 + PKCE clients can be registered in Settings → API;
  third-party 2026 articles say third-party OAuth isn't enabled for new developers. User to check their Buffer settings.

### Phase 9 — Payments + rate limiting (2026-09-16, session 8)
- **Payments (ZoomGuru Payment API / Paystack) built, tested, deployed, live.** `payments.py` (+ `payments` table,
  `subscriptions.expires_at`, `fx_rate` in migration 007): USD prices charged in kobo at a live USD→NGN rate
  (open.er-api.com, 24 h cache in `fx_rate`, stale value kept on failure, seed 1600); each payment buys 30 days
  (renewing the same plan stacks days, switching starts fresh); `apply()` is the only plan activator and runs once
  per reference (`applied_at is null` update); webhook = HMAC-SHA512 over the raw body (`x-zoomguru-signature`),
  throttled 30/min/IP; worker `reconcile_payments` thread re-verifies payments pending >15 min. `billing.subscribe`
  refuses when `PAYMENT_API_KEY` is set (free path for dev/tests only). Routes: `POST /api/billing/checkout`
  `{plan, email}`, `POST /api/payments/callback` (public), `GET /api/billing/payments/{ref}`. `kobo = round(usd_cents × rate)`
  ($39 at ₦1500 → 5,850,000 kobo). Website: checkout takes an email (prefilled from `useUser`), shows the Naira
  amount, redirects to Paystack; `/checkout/return` polls the status route. App shows the renewal date. Tests in
  `test_jobs.py` via `fake_payments.py` (initialize/verify/pay()/callback(); `fail` switches unused).
  Env: `PAYMENT_API_KEY`, `PUBLIC_API_URL` (webhook target — the API directly, not the auth'd website proxy),
  `WEBSITE_URL` (browser return page), set on Railway api + `.env` (git-ignored; guide is
  `apps/docs/payment-api-integration.md`, also git-ignored). **No real end-to-end purchase yet; rotate the key
  before launch.**
- **Rate limiting (api.py):** `limited(key, cap)` fixed window — Redis `INCR/EXPIRE` when `REDIS_URL` set, else
  in-memory dict (with a 10k sweep); Redis errors fall back to memory. Caps: 240/min per owner (in `signed_in`),
  10/min uploads, 10/min project starts, 5/min checkout, 30/min webhook per IP → 429. `redis==6.4.0` in
  requirements. User picked Railway's own Redis over Upstash/memory-only (2026-09-16).
- **Railway via CLI:** `railway add -d redis` — careful: its prompts confirm on piped newlines (three Redis
  instances created; extras + detached volumes deleted with `railway service delete -s X -y` / `railway volume
  delete -v X -y`; detached volumes linger in `status` output after deletion — `railway volume ls` is the truth).
  Database services don't auto-inject `REDIS_URL`; set it to `redis://redis.railway.internal:6379` manually.
  Deployed api `62132cad` + worker `6bf8bb93` (2026-09-16, 10:24): payments, rate limiting and session 7's
  clip-count fix live; migration 007 ran on boot. Vercel auto-deployed the website from push `2bd3d35`.
- **Per-user Buffer OAuth (2026-09-16, session 8):** the multi-user publishing fix, and the cheap one: Buffer client
  registration is **self-serve** (Buffer → Settings → API; docs at developers.buffer.com/guides/authentication.html),
  OAuth = Authorization Code + PKCE at auth.buffer.com, refresh tokens single-use + rotated, scopes `account:read
  posts:write offline_access`. Built `oauth.py` + migration 008 (`connected_accounts` one-per-owner+provider,
  `oauth_states` 10-min single-use, PKCE verifier stored server-side); `publishing.call(token=)` — owner's token
  when connected, else the workspace key gated by `BUFFER_OWNERS`; `allowed()` returns the token to use; 401 with a
  user token → "Connect it again" (401); failed refresh deletes the row (reconnect = only fix). Routes
  `GET /api/publishing/connection`, `POST .../connect/buffer`, `POST .../callback` (route checks `state_owner` ==
  caller), `DELETE .../connection`. Website: Connect/Disconnect on integrations + `/oauth/return` (app-group page,
  code+state through the authed proxy). Env: `BUFFER_CLIENT_ID`, `BUFFER_CLIENT_SECRET`, `BUFFER_REDIRECT_URL`
  (defaults off `WEBSITE_URL`). fake_buffer grew an auth endpoint (rotation, replay refusal) and accepts issued
  access tokens. NOT live yet: user must register the Buffer app + set env + deploy.
  **Research:** Masterjx9/socialmediascheduler = per-platform direct APIs but **no LICENSE** (README claims MIT,
  file 404s) → read-only reference; Matthew-Selvam/Open-Dispatch = MIT, FastAPI self-hosted Buffer-alternative with
  per-platform `publish()` adapters (~80 LOC, YouTube resumable + OAuth refresh, LinkedIn chunked upload) but
  credentials-in-env (not multi-tenant) → adapter reference for direct APIs later; Buffer OAuth beat both on cost.
- **New APK** (`app-release.apk`, 61.2 MB, 2026-09-16): first since the redesign + renewal date; still not run on
  a phone. All checks green: test_jobs (incl. payments), test_clipper, flutter analyze + 21 tests, website build +
  check.mjs.

## Left

### Immediate
- [x] **R2 storage live** (2026-09-15). User created bucket **`clipperai`** and an R2 **Admin Read & Write** token
      (account-wide: it can also see the user's unrelated bucket `zoomguru-releases`, never touch it). Keys are in
      `.env` (`S3_BUCKET=clipperai`, default endpoint). Bucket had only R2's default "abort multipart after 7 days"
      rule; `storage.setup` replaced all rules, so it now adds a bucket-wide `unfinished-uploads` rule (1 day) itself.
      `python storage.py setup` applied: uploads 1 d, projects 30 d, unfinished uploads 1 d, CORS. Verified live
      (scratch script): server upload + HEAD size, 24 h signed GET (Content-Disposition attachment, video/mp4), 7-day
      signed GET, streamed read, CORS preflight 204 `*`, signed PUT + worker download, wrong content type → 403,
      delete_prefix, bucket empty after. `test_jobs.py` ok after the rule change.
- [x] Committed + pushed Phase 7 and the Telegram/CLI removal (39d434c, 2026-09-15, user asked).
- [ ] **Rotate the R2 token**: the user pasted its values into the chat. Create a new one (ideally "Apply to specific
      buckets only: clipperai, clipperai-published"), put it in `.env`, delete the old one in Cloudflare.
- [ ] User: delete the 3 Phase 6 test videos on "The Micro-Fix" (public NbWBjHIFG2M, VHLmTNy7Ex8; private uVqdDp9WFvc).
- [ ] User: delete the old CLI folders `apps/backend/out/` (30 MB) and `work/` (185 MB) when no longer wanted; then the
      `work/` and `out/` lines can leave `.gitignore`.
- [ ] User: choose a code license (public repo, no license file).
- [ ] Not yet on real R2: a large (tens of MB, multipart) clip upload through Avast, and a full project processed end
      to end (costs Groq/DeepSeek cents; Avast may block yt-dlp/DeepSeek, so use the upload path).
- [ ] Upgrade Groq to Developer plan before real customers (free plan: 20 req/min, 7,200 audio-s/hour,
      28,800 audio-s/day shared across all customers).

### Product direction (decided 2026-09-14, narrowed 2026-09-15, beyond masterprompt.md)
- **Only two ways to use the product: the website and a Flutter mobile app** (`apps/mobile`, iOS + Android), on one
  account/subscription/usage balance. The user scrapped the Telegram bot and the command-line tool (2026-09-15) and
  then the **MCP server** (2026-09-15, replaced by the mobile app; the user deleted `apps/mcp` and created
  `apps/mobile`). Don't build other channels. The REST API serves both clients; it is not a channel.
- **Payments happen only on the website** (subscriptions). The app never takes payment (store rules); it shows plan
  and usage.
- **Backend hosting: Railway** (API + worker services, Railway Postgres; media on R2).
- Limits/subscription checks enforced once in backend services so every channel gets identical rules.

### Phase 5 — Next.js website (`apps/website`)
- [ ] **Unblock local end-to-end** (user action): Avast Web Shield currently cuts local HTTP downloads > ~1–2 MB and
      breaks yt-dlp HTTPS (see gotchas). Add Avast exceptions (or pause Web Shield) then run a real link + upload
      project through `dev.py` + website and click through review in a real browser.
- [x] `calendar.csv` in the content package (Phase 7).
- [ ] Remaining §39 pages when their phases land: brand. (Calendar and settings/integrations exist.)
- [ ] Nice to have: store the video title (yt-dlp info / upload filename) so lists don't show URLs/"Uploaded video";
      re-render with an edited hook ("Render all", §40); a real product visual on the landing page (a clip from a
      video we have rights to).
- [ ] **Real payments** (only when the user asks): provider with hosted checkout + webhooks (no card data on our
      servers) → start checkout in `billing.subscribe`, activate from webhook, billing period instead of calendar
      month, cancel at period end, invoices from the provider. Confirm Pro/Business prices with the user.
- [x] Accounts: Clerk sign-in/up, protected pages, backend verifies Clerk session tokens, per-owner data (2026-09-15).
- [ ] **User:** sign up as the first real user at http://localhost:3000 (Clerk's guide: then click "Configure your
      application" if it appears; explore Organizations/Components/Dashboard). Then put that Clerk user id in
      `BUFFER_OWNERS` for real publishing (`clerk users list` shows it) and, if wanted, give the 4 old ownerless projects
      that owner.
- [ ] Clerk components in dark mode (card stays light); Clerk production instance + domain at deploy.
- [ ] **Per-account publishing connection** (each account its own Buffer key or a multi-customer posting API) before
      anyone else can sign up for real; until then `BUFFER_OWNERS`.

### Phase 6 — Publishing (Buffer): remaining
- [x] First real post (private YouTube test via script), see Done. Buffer channels now: YouTube "The Micro-Fix",
      Instagram @theprimefactor.
- [x] Website against real Buffer + R2: post now, schedule, unschedule (2026-09-15, see Done). Runs the API on real R2,
      not `dev.py` (forces fake S3). **Never post publicly to the user's accounts without their explicit go-ahead.**
- [ ] Instagram for real: user switches @theprimefactor to a creator/business account and reconnects it in Buffer.
- [ ] Maybe: YouTube privacy choice (public/unlisted/private) on the Publish form.
- [ ] Custom domain for the public bucket before launch (r2.dev is rate-limited, "for development").
- [x] Committed + pushed Phase 6 (2026-09-15, user asked).

### Phase 7 — Content calendar
- [x] Days/times/start date/channels → approved clips spread over free times; list calendar UI; calendar.csv;
      "Schedule all" (2026-09-15, see Done). Queued posts go to Buffer through the worker (solves the 100/15 min limit).
- [x] Link-expiry blocker solved in Phase 6 by public copies: posts can be scheduled up to 30 days ahead, and a copy
      outlives the 30-day `projects/` rule (45-day backstop). A calendar longer than 30 days would need `AHEAD` and
      `PUBLIC_DAYS` raised together.
- [x] One real calendar post through the page + worker to real Buffer, then unscheduled (2026-09-15, see Done).
- [x] 30-post batch against real Buffer (2026-09-15): worker fine; Buffer plan caps scheduled posts at 10.
- [x] Removed the 10 real scheduled test posts and deleted test projects A/B (2026-09-15, Buffer shows 0 waiting).
- [ ] Real 429 test: blocked by the permission classifier (the user would need to allow it or run it themselves).
- [ ] **Buffer's scheduled-posts cap (10 on this plan):** user decides: upgrade Buffer, and/or make the calendar stop
      sending a channel's queue after "Scheduled posts limit reached" (saves ~1 request per refused post) and warn
      before scheduling more than fits.
- [ ] Maybe: one calendar across all projects (today it's per project; busy times are already checked across projects),
      per-slot channel choice (spec example shows different networks per day), "Unschedule all".

### Phase 8 — Mobile app, Flutter (next; `apps/mobile`)
- [ ] Decisions to settle at the start: Clerk sign-in in Flutter (Clerk's Flutter SDK maturity, or a fallback),
      state management/HTTP packages (smallest set; each gets a `DECISIONS.md` row), app id/name, iOS build route
      (this PC is Windows: Android first, iOS needs a Mac or a cloud build).
- [ ] App as a thin client of the REST API over HTTPS with `Authorization: Bearer <Clerk session token>`; backend
      checks: `authorized_parties` for app tokens; nothing else should need backend changes for the first version.
- [ ] Screens: sign in/up; new project (paste link, share-to-app link, pick video from gallery → `POST /api/uploads` +
      signed PUT with progress); projects list (poll while running); project review (play clip, approve/reject, edit,
      copy post per platform, save to gallery, share); publish now/schedule + calendar list; plan + usage (read-only,
      "manage your plan on the website").
- [ ] Look follows `DESIGN.md` (ground #f4f6fa, accent #2355f5, Geist, pill buttons, 16/24 px cards).
- [ ] Runnable checks: Flutter widget/unit tests for API calls and screens (fake API), plus a run on an Android
      emulator against `dev.py --fake-buffer` (emulator reaches the PC's localhost at 10.0.2.2).
- [ ] Later: push notifications (project done, post failed), background uploads, offline saved clips.
- [ ] Real phone testing needs the backend on Railway (public HTTPS), so parts of Phase 10 may come first.

### Phase 9 — Billing & usage
- [x] Plans + monthly limits, enforced in backend services (2026-09-14); per owner since Clerk (2026-09-15).
- [ ] Per-job cost tracking (§33: STT seconds, LLM tokens from `usage`, render seconds, storage bytes, publishing ops),
      overage. Decide the new price list with the user (pricing report proposal: $12/6 h, $24/20 h, $59/60 h, free 60 min).
- [ ] When payments go live: subscription state from the provider's webhooks (see Phase 5 "Real payments").

### Phase 10 — Hardening + deploy (Railway, confirmed by the user 2026-09-15)
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
- Source URL DNS checked once (rebinding).
- Accounts: an upload's random id is the only link to its uploader (≤1 day); `BUFFER_OWNERS` gates the one Buffer key;
  the 4 pre-Clerk dev projects have no owner.
- Publishing: one Buffer key for the deployment (`BUFFER_OWNERS`); YouTube category fixed to 22; public copies of posts nobody re-checks
  stay until the 45-day rule; if Buffer marks a post error and the user retries inside Buffer, the copy is already
  gone (retry from ClipperAi instead); if Buffer creates a post
  but the reply times out, the row says error and a retry can post twice; a crash between inserting a publication and
  Buffer's answer leaves a `sending` row with no Buffer id (blocks that clip×channel until removed via DELETE).
- Calendar: every clip goes to the same channels at the same time; clips in clip order (not score); a `sending` calendar
  row with no Buffer id after a worker crash stays until removed through the API; the worker waits 60 s after any
  error (one global backoff, not Buffer's Retry-After); an approved clip un-approved after scheduling still goes out.
- Billing: per owner (org or user); calendar-month usage; running projects don't reserve allowance (a month can overshoot by one
  video); minutes = speech length of completed projects; ZIP bytes flow through the API server.
- STT fallback when needed: onnx-asr + Parakeet v3 on CPU (~$0.01/audio-hr, European languages only).

### 2026-09-15 (session 7) — debugging: only 3 clips, app sign-in loop
- **Only 3 clips:** the automatic count was `round(speech seconds / 360)` with a floor of 3, so every video under ~21 min
  got 3. Now one per 2 minutes (3–30; an hour → 30); DeepSeek `max_tokens` 16000 → 64000 (30 clips of copy ≈ 12K
  tokens + thinking; model max output 384K). Website hint, FAQ, tools page and README say "about one per 2 minutes".
  Check: `test_clipper.py` asserts an hour → 30, 20 min → 10.
- **App sign-in "Incorrect code (ERROR RECEIVED FROM SERVER)" loop:** reproduced against the dev instance with the SDK
  itself. Password sign-in from a new device gets `needs_second_factor` (Clerk Client Trust, email code).
  `clerk_auth` 0.0.18-beta (newest) compares the typed identifier with Clerk's lowercased copy; any capital → new
  sign-in + a new code at the code step, so the typed code is always wrong. Fix: `apps/mobile/third_party/clerk_auth`
  (copy, one-line case-insensitive compare, `dependency_overrides`, excluded from lints). Check:
  `test/sign_in_test.dart` replays recorded Clerk replies (`test/clerk/*.json`, no tokens); fails on the unpatched SDK.
  Verified live: capitalised email and username keep one sign-in, right code signs in. Backend accepted the native
  token (billing/projects 200) and Clerk's native API is enabled, so neither was the cause.
- Checks: test_clipper ok, test_jobs ok, flutter analyze clean, flutter test 14 passing, next build ok, check.mjs ok
  (on :3001; an older server holds :3000 and an older backend :8000). walkthrough.mjs not run (needs :8000).
- Pending: rebuild the APK and try it on the phone; not deployed (Railway worker needs `railway up` for the clip count).

### 2026-09-16 (session 7 continued) — the app redesigned, browser sign-in, website parity
- **Look** (user's reference screenshot + our colours/photo): welcome screen = sky photo, logo, curved white sheet with
  *Continue with Google* / *Continue with email*; signed-in app = floating four-place bar (Projects, Publishing, Plan,
  Account), search + filter chips, two-column picture tiles. Files: `welcome.dart`, `home.dart` (shell, `NavBar`,
  `Account` inherited widget, `PageTop`, `Avatar`), `screens.dart` (projects, project, clips), `publish.dart`
  (editor, publish, posts, calendar), `account.dart` (publishing, plan, account), `ui.dart` (shared pieces).
- **Website parity added:** Publishing page (Buffer + channels), plan price/start/cancel/history/every plan, progress
  steps, Approve all, Download all (zip through the share sheet), per-clip file chips, clip timing, each clip's posts
  with View post and Unschedule, calendar grouped by day. Plans still open the website (store rules).
- **Google/Apple sign-in now opens the phone's browser** and returns through `xyz.ytclipper.app://sso-callback`
  (`redirectionGenerator` + `app_links` in `clerkConfig`, intent-filter + `flutter_deeplinking_enabled=false` in the
  manifest). Clerk accepts the scheme (checked live against the dev instance). Email stays in the app (user's choice).
- **`phosphor_flutter` can't compile on Flutter 3.47** (`IconData` is now final; analyze passes, build fails) →
  `phosphor_icons` 3.0.1 instead.
- Checks: `flutter analyze` clean, `flutter test` 21 app tests + the sign-in test, website build + check.mjs, backend
  tests. Screens were reviewed as rendered pictures (`flutter test test/render.dart --update-goldens`, goldens
  git-ignored); that found a real crash (a post with no date) and the label/step cleanups.
- **Payments are next; decided but not built** (user, 2026-09-16): the **ZoomGuru Payment API** (Paystack underneath),
  guide at `apps/docs/payment-api-integration.md` (**git-ignored: it holds a live secret** and the repo is public; the
  key goes in `apps/backend/.env` as `PAYMENT_API_KEY` and on Railway, and is worth rotating before launch).
  - **Charge in Naira, show USD.** Plans stay $15 / $39 / $99; the charge is that price converted to kobo.
  - **The USD→NGN rate is fetched live and refreshed daily**, last good rate kept as the fallback. Checkout says what
    is really charged ("$15.00 a month, charged as ₦24,000").
  - **Each payment buys 30 days**, then a "Renew" button; no card kept, nothing self-charges (the payment API does not
    manage subscriptions, and this avoids storing cards).
  - Shape of the work in handover.md: `payments.py`, a `payments` table + subscription expiry, checkout route,
    signature-verified callback (HMAC-SHA512 over the raw body) plus an authoritative verify, a worker pass that
    re-verifies stale pendings, website checkout/return pages, a fake payment API in the tests.
- **Clip count stays about one per 2 minutes** (user, 2026-09-16, asked because `jobs.py` had been hand-edited to say
  one per minute; that line now matches the code).
- Pushed 2026-09-16: `68db596` (clip count, sign-in fix, app redesign, website parity).

## Lessons learned / gotchas
- **clerk_auth restarts a sign-in when the typed identifier differs from Clerk's (case)** — patched copy in
  `apps/mobile/third_party`; drop it when an upstream release fixes it. Clerk FAPI returns 403 to Python's default
  user agent (set one when scripting it).
- **Clerk native tokens have no `azp`**: `clerk-backend-api`'s `authorized_parties` rejects them; check `azp` only when
  present (`api.signed_in`).
- **Gradle behind Avast**: the wrapper download fails with PKIX errors; Java must use the Windows trust store
  (`JAVA_TOOL_OPTIONS=-Djavax.net.ssl.trustStoreType=Windows-ROOT`). Flutter can't load woff2 fonts (convert to TTF).
- **Vercel CLI** needs `NODE_EXTRA_CA_CERTS` on this PC (else "fetch failed"). Git Bash rewrites `/path` args to
  `C:/Program Files/Git/path`: probe URLs with node or PowerShell.
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
- **Buffer API facts (checked live 2026-09-15):** bad key → HTTP 401 `{"errors":[{"extensions":{"code":
  "UNAUTHENTICATED"}}]}`; `post(input:{id})` unknown → HTTP 200, `errors[0].extensions.code = NOT_FOUND`, `data: null`
  (so never batch several `post` lookups with aliases: one missing post nulls the whole response); `createPost` refusals
  are typed `MutationError`s with `message` (unknown channel → "Channel not found"); `deletePost` unknown →
  `VoidMutationError` "Document not found". `CreatePostInput.needsApproval` and `assets` are required; `Service` uses
  `twitter` for X; `posts` query can't filter by id. Introspection works with a personal key.
- **Real posting findings (2026-09-15, YouTube channel "The Micro-Fix"):** (1) YouTube needs `categoryId` too
  ("Invalid post: YouTube posts require a category."; the schema says "Required on create", my first dump truncated
  descriptions) → `publishing.py` sends "22". (2) **Buffer reads and checks the video at createPost**, not only at send
  time. (3) **Buffer can't read R2 signed links** ("Invalid post: Video could not be read from its URL.", with and
  without response-content-disposition), while a plain public mp4 URL is read and analysed. R2 signed GET links answer
  HEAD with 403 (likely cause). (4) Buffer → YouTube = Shorts: vertical, ≥360 px each side (ours are 1080×1920).
  Tests used drafts (`saveToDraft: true`, `mode: addToQueue`); all refused, nothing created. So published clips need a
  **public, non-signed link** → public bucket copies (see Phase 6 Done). (5) The r2.dev address answers HEAD and GET;
  R2 cross-bucket CopyObject keeps Content-Type. (6) moto refuses anonymous reads unless the bucket has a public-read
  policy, and refuses HEAD even then: the fake Buffer checks links with a ranged GET.
- **Buffer + Instagram personal profiles:** automatic posting is refused ("require notification scheduling"); Buffer
  channel `type` is `profile` for personal, `business` for creator/business. YouTube channels are `type: channel`.
- Scheduled posts on real Buffer go out on time (sent 2 s after `dueAt`); `dueAt` comes back as `...Z` with seconds 0.
- `fake_buffer.py` matches queries by substring (`createPost`, `deletePost`, `post(input`, `channels(`,
  `organizations`): keep `publishing.py`'s documents containing those words or extend the fake.
- Walkthrough race: text that appears on a busy button ("Posting...") also matches `has()`; wait on the specific
  region (`section[aria-label=Posts]`).
- **pgserver's Windows Postgres has no time zone files** (`pg_timezone_names` → "could not open directory
  .../share/postgresql/timezone"; `at time zone 'America/New_York'` → not recognized). Do time zone math in Python
  (`zoneinfo` + `tzdata`), not SQL, or tests/dev break while Railway Postgres would work.
- `urllib` + a server that takes the request but never answers → bare `TimeoutError` (from `getresponse`); connection
  refused / connect timeout → `URLError`. `publishing.call` keeps it as `PublishError.__cause__`.
- Walkthrough race: after a clip action the re-rendered button can still be `disabled` (busy until the request's
  `finally`); wait for `!b.disabled` before clicking.
- **Next 16 `proxy.ts` + `next start -H 127.0.0.1` = every request hangs** ("Failed to proxy http://localhost:3000/...
  socket hang up"): Next forwards proxied requests to `localhost`, which resolves to `::1` here. Bind `-H localhost`
  (listens on ::1 only) and use http://localhost:3000; without `-H` it works but listens on the whole network.
- **The Next server itself needs `NODE_EXTRA_CA_CERTS` behind Avast**, not just npm: otherwise Clerk's handshake fetch
  fails (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`, "Refreshing the session token resulted in an infinite redirect loop") and
  a browser that Clerk JS shows as signed in stays signed out on the server (header shows Sign in, /dashboard loops).
- **Clerk's Python SDK (httpx) hangs silently behind Avast** (no error, timeout_ms ignored) → `SSL_CERT_FILE=<bundle>`
  in backend `.env`; the backend's token verification needs it too (JWKS fetch).
- Clerk development instances answer browser-style page requests (`Accept: text/html`, `Sec-Fetch-Dest: document`)
  with a 307 to `<app>.clerk.accounts.dev/v1/client/handshake`; plain requests show the real rules (public 200,
  protected 307 → /sign-in). `clerk init` leaves every route public, omits the `/__clerk/:path*` matcher and breaks
  the layout's indentation. This Clerk app requires a username (`users.create` → `form_data_missing username`).
  `authenticate_request` accepts any token type by default (set `accepts_token`); v2 session tokens carry the org as
  `o.id`, the SDK copies it to `org_id`. Sign-in tickets: `sign_in_tokens.create` → open
  `/sign-in?__clerk_ticket=<token>` (signed in after ~10 s here). `<SignIn/>` loads from Clerk's CDN (several seconds).
- Next.js 16 ships its docs in `apps/website/node_modules/next/dist/docs/` (route handlers take
  `RouteContext<"/api/[...path]">`, params are Promises, `middleware` is now `proxy`).

## User preferences
- Wants ponytail-style minimal solutions and honest, plain-English status (what works, what wasn't verified).
- For website/UI work also use the design skills (asked 2026-09-14): `impeccable`, `ui-ux-pro-max` (not a registered
  slash skill: read `~/.agents/skills/ui-ux-pro-max/SKILL.md`, search script `scripts/search.py`) and
  `design-taste-frontend` (installed globally 2026-09-14). They conflict with each other and with ponytail in places
  (icon libs, Motion/GSAP, stock images, indigo palettes); the project brief + ponytail win, use their checklists.
- Keys: GROQ, DEEPSEEK, BUFFER, R2 (`S3_*`, `S3_PUBLIC_*`) in `apps/backend/.env` (never echo).
