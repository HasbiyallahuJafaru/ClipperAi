"""The free public video downloader (a traffic tool, not part of any plan): paste a link from any site in
api.SITES, watch it fetch, download an MP4. Nothing here touches subscriptions, usage or allowance — visitors don't even sign in.

Abuse surface and its guards: per-IP rate limits live in api.py; start() additionally caps concurrent fetches
(semaphore) and live temp bytes (disk budget) so one visitor can't monopolise the worker or fill the disk; tokens
are 128-bit unguessable; the caller (api.tool_resolve) only passes links on its allowlist of sites.

YouTube no longer serves single-stream (video+audio) MP4s to anonymous clients, so the fetch remuxes the best file
up to 720p once (ffmpeg -c copy, no re-encode) into a temp file, which open() then serves until it expires. The
fetch runs in a thread: start() returns a token at once and status() reports progress for the visitor's bar.
# ponytail: fetches go out from this server's own IP. YouTube blocks datacenter IPs, so this works locally but can
# draw a bot-check in the cloud; the visitor is told to try later rather than us routing through paid proxies.
# ponytail: whole file lands on our disk and proxies through our bandwidth; if traffic grows, cap harder or move to
# a queue + object storage with signed links instead of this process."""
import shutil
import tempfile
import threading
import time
import uuid
from pathlib import Path

import yt_dlp

TTL = 3600  # a finished download stays fetchable for an hour
MAX_SECONDS = 30 * 60  # longer videos are rejected: bounds disk and bandwidth per visitor
MAX_CONCURRENT = 2  # fetches running at once; a visitor's third starts waiting on the rate limit instead
MAX_DISK = 2 * 1024**3  # refuse new fetches while live temp files exceed this
_lock = threading.Lock()
_jobs: dict[str, dict] = {}  # token -> job dict, see start()


def _opts() -> dict:
    opts = {"quiet": True, "noprogress": True, "no_warnings": True, "noplaylist": True,
            "js_runtimes": {"deno": {}, "node": {}},  # YouTube extraction needs a JS runtime now
            "format": "bv*[height<=720][ext=mp4]+ba[ext=m4a]/bv*[height<=720]+ba/b",
            "format_sort": ["res:720", "vcodec:h264", "acodec:aac"],
            "merge_output_format": "mp4",  # remux, not re-encode
            "outtmpl": str(Path(tempfile.mkdtemp(prefix="dl-")) / "%(id)s.%(ext)s"),
            "retries": 3, "fragment_retries": 3}
    return opts


class Busy(Exception):
    """Too many fetches running or too much live temp data; the visitor should try again in a minute."""


class Expired(Exception):
    """The token is unknown or stale; the visitor just searches again."""


class TooLong(Exception):
    """The video is beyond the free tool's length cap."""


def _sweep():
    for token, job in list(_jobs.items()):
        if time.monotonic() - job["at"] > TTL:
            _jobs.pop(token, None)
            if job.get("path"):
                shutil.rmtree(job["path"].parent, ignore_errors=True)


def _live_bytes() -> int:
    return sum(j["bytes"] for j in _jobs.values() if j.get("bytes") and j["status"] != "served")


def start(url: str) -> dict:
    """Begin fetching a video in the background: returns {"token"} at once; poll status() until ready."""
    _sweep()
    with _lock:
        running = sum(1 for j in _jobs.values() if j["status"] == "fetching")
        if running >= MAX_CONCURRENT or _live_bytes() > MAX_DISK:
            raise Busy
        token = uuid.uuid4().hex
        _jobs[token] = {"at": time.monotonic(), "status": "fetching", "progress": 0, "bytes": 0,
                        "title": None, "duration": None, "thumbnail": None, "path": None, "error": None}
    threading.Thread(target=_work, args=(token, url), daemon=True).start()
    return {"token": token}


def _work(token: str, url: str):
    root = None
    try:
        ydl = yt_dlp.YoutubeDL(_opts() | {"progress_hooks": [lambda d: _progress(token, d)]})
        root = Path(ydl.params["outtmpl"]["default"]).parent  # the tempdir goes away on every failure path too
        with ydl:
            info = ydl.extract_info(url, download=False)
            if (info.get("duration") or 0) > MAX_SECONDS:
                raise TooLong(f"Videos up to {MAX_SECONDS // 60} minutes work with the free downloader.")
            _set(token, title=info.get("title"), duration=info.get("duration"),
                 thumbnail=info.get("thumbnail"), progress=1)
            info = ydl.extract_info(url, download=True)  # same IP fetches the bytes
        path = Path(info["requested_downloads"][0]["filepath"])
        with _lock:
            job = _jobs[token]
            job |= {"status": "ready", "progress": 100, "path": path,
                    "bytes": path.stat().st_size, "title": job["title"] or info.get("title") or "video"}
        return
    except TooLong as e:
        message = str(e)
    except yt_dlp.utils.DownloadError as e:
        blocked = "not a bot" in str(e) or "Sign in to confirm" in str(e)
        message = ("That site is blocking our server right now. Please try again in a few minutes." if blocked
                   else "Couldn't fetch that video. Check the link and try again.")
    except Exception:
        message = "Couldn't fetch that video. Check the link and try again."
    if root:
        shutil.rmtree(root, ignore_errors=True)
    _fail(token, message)


def _progress(token: str, d: dict):
    if d.get("status") != "downloading":
        return
    total = d.get("total_bytes") or d.get("total_bytes_estimate")
    if not total:
        return
    # video and audio each run 0-100; the remux finishes the last few percent
    percent = min(95, int((d.get("downloaded_bytes") or 0) * 92 / total) + 1)
    with _lock:
        if token in _jobs:
            _jobs[token]["progress"] = max(_jobs[token]["progress"], percent)


def _set(token: str, **fields):
    with _lock:
        _jobs[token] |= fields


def _fail(token: str, message: str):
    with _lock:
        job = _jobs.get(token)
        if job:
            job |= {"status": "error", "error": message}
            if job.get("path"):
                shutil.rmtree(job["path"].parent, ignore_errors=True)
                job["path"] = None


def status(token: str) -> dict:
    """What the visitor's progress bar needs. Raises Expired when the token is unknown or stale."""
    with _lock:
        job = _jobs.get(token)
        if job is None or time.monotonic() - job["at"] > TTL:
            raise Expired
        out = {"status": job["status"], "progress": job["progress"], "title": job["title"],
               "duration": job["duration"], "thumbnail": job["thumbnail"]}
        if job["status"] == "ready":
            out |= {"formats": [{"id": "mp4", "height": None, "ext": "mp4", "bytes": job["bytes"]}]}
        if job["status"] == "error":
            out |= {"error": job["error"]}
        return out


def open(token: str) -> tuple[str, int, object]:
    """(file name, size, chunk iterator) for a ready download. Raises Expired when it's unknown or stale;
    the job ends once the file has been served."""
    with _lock:
        job = _jobs.get(token)
        if job is None or time.monotonic() - job["at"] > TTL or job["status"] != "ready":
            raise Expired
        title, file, size = job["title"], job["path"], job["bytes"]
        job["status"] = "served"  # one download per token; the file goes away when the stream ends

    def chunks():
        try:
            with file.open("rb") as media:
                while chunk := media.read(256 * 1024):
                    yield chunk
        finally:
            shutil.rmtree(file.parent, ignore_errors=True)
            with _lock:
                _jobs.pop(token, None)

    return title, size, chunks()
