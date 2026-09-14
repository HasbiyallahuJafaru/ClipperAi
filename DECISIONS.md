# Phase 0 — Decisions

Verified 2026-09-14. Only non-obvious items were researched; the rest are well-known defaults.

| Component | Project | License | Integration | Decision |
|---|---|---|---|---|
| Acquisition | yt-dlp | Unlicense | Python library | **Use.** Datacenter IPs (Railway) often hit YouTube's bot wall — upload path must be first-class; residential proxy / cookies if URL path fails in prod. **YouTube now needs a JS runtime** (deno or node) on the machine — include one in the deploy image. |
| Captions font | Montserrat ExtraBold (`fonts/`, vendored) | SIL OFL 1.1 | `ass` filter `fontsdir` | **Used.** Same look on Windows and Linux. |
| Existing captions | yt-dlp `writeautomaticsub` (json3) | Unlicense | same library | **Later.** Auto-captions lack punctuation (hurts sentence boundaries), uploaded captions lack word timing, and Groq costs $0.04/hr. Add when STT spend is measurable. No extra dep needed (skip youtube-transcript-api). |
| STT | Groq `whisper-large-v3-turbo` | API | OpenAI-compatible HTTP | **Used.** $0.04/audio-hr, word timestamps via `verbose_json` + `timestamp_granularities=[word,segment]`. 610 s chunks (10 s overlap, stitched at seams) of 16 kHz mono **16-bit** FLAC, each encoded standalone (segment-muxer FLAC pieces → Groq 500). **Capacity:** free plan = 20 req/min, 7,200 audio-s/hour, 28,800 audio-s/day across all customers → upgrade to the Developer plan before launch. Batch API (50% off, 24 h+ window) possible for a slow/cheap tier. |
| STT fallback | onnx-asr + NVIDIA Parakeet TDT 0.6B v3 (int8, CPU) | MIT + CC-BY-4.0 | pip + 670 MB model | **Later.** ~$0.01/audio-hr on Railway CPU vs Groq $0.04, but 25 European languages only. Add when STT spend > ~$50/month or for Groq outages. faster-whisper on rented CPU costs more than Groq. xAI STT dropped — no key. |
| LLM | DeepSeek `deepseek-flash` (pass 1), `deepseek-v4-pro` (pass 2) | API | `openai` SDK, `base_url=https://api.deepseek.com` | **Use.** $0.15/$0.60 per 1M in/out (off-peak). JSON mode: `response_format={"type":"json_object"}` + word "json" in prompt; can return empty → retry. |
| SDK | openai-python | Apache-2.0 | pip | **Use** for both Groq and DeepSeek. One dep, no per-provider SDKs. |
| Validation | pydantic | MIT | pip | **Use.** Comes with FastAPI anyway. |
| Video processing | FFmpeg | LGPL/GPL (build-dependent) | CLI subprocess, arg arrays | **Use.** Separate process → no linking obligations. |
| Smart crop | YuNet face detector (`models/face_detection_yunet_2026may.onnx`, 230 KB, vendored) via OpenCV `FaceDetectorYN` + own shot logic | MIT (opencv_zoo) | vendored file | **Used (Phase 2).** Chosen over MediaPipe: OpenCV is needed for frame reads anyway, so one dep instead of two. **Avoid anything built on Ultralytics YOLO — AGPL-3.0.** Google AutoFlip is legacy. |
| CV | OpenCV (`opencv-python-headless` 5.0) | Apache-2.0 | pip | **Used** for frame reads + face detection. |
| Captions | ASS written by hand + FFmpeg `subtitles` filter (libass, ISC) | — | stdlib string formatting | **Use.** Word highlighting = ASS `\k` / per-word events. No caption engine dep. |
| Storage | Cloudflare R2 via boto3 (`storage.py`) | Apache-2.0 | pip | **Used (Phase 4).** S3 = same code, different endpoint. Clips/captions/thumbnails/clips.json → `projects/<id>/`, served as 24 h signed GET links. Uploads: signed PUT (content type signed; R2 has no POST-form uploads, so size is checked with HEAD before a project is accepted, 5 GB cap) → `uploads/<id>`. **Lifecycle via bucket rules, not app code:** `uploads/` 1 day, `projects/` 30 days (`python storage.py setup`, needs a token with Workers R2 Storage Write). Worker deletes its local scratch after every run and the uploaded source once the project is final. R2: $0.015/GB-month, free egress, 10 GB free. |
| S3 test double | moto (`ThreadedMotoServer`) | Apache-2.0 | pip, tests only | **Used** in test_jobs.py (rejects region `auto` on CreateBucket only). |
| Publishing | Buffer GraphQL API (`https://api.buffer.com`, Bearer) | API | httpx | **Use (Phase 6).** Video must be a **public URL** → needs R2 signed URL. Docs say OAuth 2.0 exists for third-party apps, secondary sources say it isn't open to new devs yet → MVP: user pastes personal Buffer key; confirm OAuth app registration at Phase 6. |
| Publishing alt | Ayrshare (paid SaaS) / Postiz (AGPL-3.0) | — | — | **Fallback only.** Postiz AGPL → only as unmodified separate service. |
| Job queue | Postgres `SELECT … FOR UPDATE SKIP LOCKED` on the `projects` table | PostgreSQL | SQL (`jobs.py`) | **Used (Phase 3).** No Redis, no queue lib. Heartbeat thread + 2-min stale requeue, 3 attempts with 2/4-min backoff, permanent errors fail fast, cancel checked at each step. |
| API | FastAPI + uvicorn | MIT + BSD-3 | pip (`api.py`) | **Used (Phase 3).** Shared bearer `API_KEY` until user accounts exist. |
| DB driver | psycopg 3 (`psycopg[binary]`) | LGPL-3.0 | pip, unmodified library | **Used.** LGPL is fine for an unmodified dependency in a SaaS. Migrations = plain `migrations/*.sql` + 15-line runner (no Alembic/ORM). |
| Dev database | pgserver (bundled Postgres 16) | Apache-2.0 | pip, dev/tests only | **Used locally** when `DATABASE_URL` is blank; Railway Postgres in production. |
| MCP | official `mcp` Python SDK, Streamable HTTP | MIT | pip, mounted in FastAPI | **Use (Phase 8).** |
| Calendar | Plain date list UI + scheduling math in Python | — | — | **Custom (Phase 7).** A few lines; no calendar component. |

## Monthly-ish unit cost (2 h podcast)
- Transcription: 2 h × $0.04 = **$0.08** (or $0 with existing captions)
- LLM: ~30k-token transcript, pass 1 flash + pass 2 pro on candidates ≈ **< $0.05**
- Dominant cost will be compute (FFmpeg render) + egress-free R2 storage, not AI.
