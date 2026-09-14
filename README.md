# ClipperAi

Turn one long video into weeks of short-form content. Paste a URL or upload a video; ClipperAi transcribes it, finds
the strongest moments, and renders captioned, speaker-framed 9:16 clips with hooks, titles and per-platform post copy.

AI makes the decisions (which moments, what to write); deterministic tools do the work (FFmpeg, OpenCV, libass).

## Status

| Phase | | |
|---|---|---|
| 0 Research | done | [DECISIONS.md](DECISIONS.md): components, licenses, costs |
| 1–2 Clipping engine | done | download, transcription, two-pass clip selection, face-tracked 9:16 crop, word-highlighted captions, thumbnails, platform copy |
| 3 Jobs | done | FastAPI + Postgres job queue with retries, cancellation, crash recovery |
| 4 Storage | done (tested against a local S3; live R2 test pending) | Cloudflare R2, signed links, direct uploads, lifecycle cleanup |
| 5–10 | next | web UI, Buffer publishing, content calendar, MCP server, billing, hardening |

Full product spec: [masterprompt.md](masterprompt.md).

## Layout

```
apps/
  backend/   Python: engine, API, worker, storage  (this README covers it)
  website/   Next.js app (Phase 5)
  mcp/       MCP server (Phase 8)
```

| File | Role |
|---|---|
| `clipper.py` | The engine and a CLI: acquire → transcribe (Groq Whisper) → select clips (DeepSeek, two passes) → render (FFmpeg) |
| `jobs.py` | Project services shared by API and MCP, plus the Postgres-backed worker (`python jobs.py`) |
| `api.py` | REST API (FastAPI) |
| `storage.py` | Cloudflare R2 / S3: uploads, signed links, bucket lifecycle setup |
| `db.py`, `migrations/` | Postgres connection and plain-SQL migrations |

## Setup (backend)

Requires Python 3.12+, [FFmpeg](https://ffmpeg.org/) on PATH, and Node.js or Deno (yt-dlp needs a JS runtime for YouTube).

```bash
cd apps/backend
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt   # macOS/Linux: .venv/bin/pip
.venv/Scripts/pip install pgserver "moto[server]"   # local dev database + test S3 (optional)
cp .env.example .env                            # then fill in the keys
```

`.env` keys: `GROQ_API_KEY`, `DEEPSEEK_API_KEY`, `API_KEY` (any long random string), `S3_ENDPOINT`,
`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`. Leave `DATABASE_URL` blank locally to auto-start Postgres
in `apps/backend/pgdata`; set it in production.

## Run

```bash
python clipper.py "https://youtu.be/<id>" -n 3     # one-off CLI run, output in out/<source>/
python storage.py setup                            # once per bucket: lifecycle rules + CORS
python jobs.py                                     # worker
python -m uvicorn api:app --port 8000              # API (every request: Authorization: Bearer <API_KEY>)
```

| Endpoint | |
|---|---|
| `POST /api/uploads` `{content_type, size}` | Signed `upload_url`; PUT the file there, then use `source: "upload:<id>"` |
| `POST /api/projects` `{source, clips?, min_seconds?, max_seconds?}` | Queue a project (202) |
| `GET /api/projects`, `GET /api/projects/{id}` | Status, human-readable message, clips with `video_url` / `captions_url` / `thumbnail_url` |
| `POST /api/projects/{id}/cancel` | Cancel queued or running work |

## Tests

```bash
python test_clipper.py   # engine logic; needs ffmpeg
python test_jobs.py      # queue + storage against throwaway Postgres (pgserver) and S3 (moto)
```

## Third-party assets

Montserrat font (SIL OFL 1.1, `apps/backend/fonts/OFL.txt`); YuNet face detection model (MIT, OpenCV Zoo).
See [DECISIONS.md](DECISIONS.md) for every dependency and its license.
