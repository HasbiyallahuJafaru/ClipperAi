"""Projects: one source video processed into clips. The service functions here are shared by the REST API and the
MCP server; `python jobs.py` runs the Postgres-backed worker that does the processing. `owner` is the Clerk
organization or user id a request acts for: nothing here reads or changes another owner's projects.

usage: python jobs.py [--concurrency N]   (default: WORKER_CONCURRENCY or 1)
"""
import argparse
import csv
import io
import ipaddress
import json
import os
import re
import shutil
import socket
import sys
import threading
import time
import traceback
import zipfile
from collections.abc import Iterator
from datetime import datetime, timedelta, timezone
from typing import Literal
from urllib.parse import urlparse
from uuid import UUID, uuid4

import openai
from psycopg.types.json import Jsonb
from pydantic import BaseModel, Field, model_validator

import billing
import clipper
import db
import storage

TMP = clipper.HERE / "tmp"  # per-project scratch space, deleted after every run
RUNNING = ["downloading", "transcribing", "analyzing", "rendering", "packaging"]
MESSAGES = {
    "queued": "Waiting to start...",
    "retrying": "Hit a problem. Trying again shortly...",
    "downloading": "Getting your video...",
    "transcribing": "Listening to your video...",
    "analyzing": "Finding your strongest moments...",
    "rendering": "Creating your clips...",
    "packaging": "Preparing your clips...",
    "completed": "Ready.",
    "failed": "Something went wrong.",
    "cancelled": "Cancelled.",
}
# explicit content types: OS mime tables disagree (Windows maps .ass to audio/aac)
CONTENT_TYPES = {".mp4": "video/mp4", ".ass": "text/plain; charset=utf-8", ".jpg": "image/jpeg",
                 ".json": "application/json"}
UPLOAD = re.compile(r"upload:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})")
# retrying these can't succeed: bad input, bad credentials, a request the provider rejects
PERMANENT = (clipper.PermanentError, openai.AuthenticationError, openai.PermissionDeniedError, openai.BadRequestError)


def public_url(url: str) -> str:
    """The worker downloads whatever a source points at, so only public http(s) hosts are allowed: no local files,
    localhost, private networks or cloud metadata addresses."""
    # ponytail: DNS is checked once; rebinding could swap the address before download - pin the IP if abused
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise ValueError("source must be an http(s) URL or an upload:<id> from POST /api/uploads")
    try:
        addresses = {info[4][0].split("%")[0] for info in socket.getaddrinfo(parsed.hostname, None)}
    except socket.gaierror:
        raise ValueError(f"cannot resolve host {parsed.hostname}") from None
    if not all(ipaddress.ip_address(a).is_global for a in addresses):
        raise ValueError("source must be on the public internet")
    return url


class NewUpload(BaseModel):
    content_type: str = Field(pattern=r"^video/[\w.+-]+$", description="e.g. video/mp4")
    size: int = Field(gt=0, le=storage.MAX_UPLOAD_BYTES, description="File size in bytes")


class NewProject(BaseModel):
    source: str = Field(description="Public http(s) video URL (e.g. YouTube), or upload:<id> from POST /api/uploads")
    clips: int | None = Field(None, ge=1, le=30, description="Clips to make; default ~1 per 6 minutes of video")
    min_seconds: float = Field(30, ge=5, le=180)
    max_seconds: float = Field(60, ge=5, le=180)

    @model_validator(mode="after")
    def check(self):
        if self.min_seconds > self.max_seconds:
            raise ValueError("min_seconds must not exceed max_seconds")
        if upload := UPLOAD.fullmatch(self.source):
            size = storage.size(f"uploads/{upload[1]}")
            if size is None:
                raise ValueError("upload not found: PUT the file to its upload_url first")
            if size > storage.MAX_UPLOAD_BYTES:  # a signed PUT can't cap size, so check what actually arrived
                raise ValueError("upload is larger than 5 GB")
        else:
            public_url(self.source)
        return self


class ClipEdit(BaseModel):
    """Review a clip. Omitted (or null) fields stay as they are. The hook is burned into the video, so it isn't here."""
    review: Literal["pending", "approved", "rejected"] | None = None
    title: str | None = Field(None, min_length=1, max_length=300)
    description: str | None = Field(None, max_length=5000)
    hashtags: list[str] | None = Field(None, max_length=30)
    posts: clipper.Posts | None = None


class Cancelled(Exception):
    pass


def present(project: dict, clips: list[dict] | None = None) -> dict:
    """API shape: adds a human message and, for finished projects, signed file links until the files expire."""
    retrying = project["status"] == "queued" and project["error"]  # a failed attempt waiting for its backoff
    project = project | {"message": MESSAGES["retrying" if retrying else project["status"]]}
    if project["status"] == "completed":
        project["files_expire_at"] = project["finished_at"] + timedelta(days=storage.CLIP_DAYS)
    if clips is not None:
        live = "files_expire_at" in project and project["files_expire_at"] > datetime.now(timezone.utc)
        base = f"projects/{project['id']}/clip"
        project["clips"] = [clip | ({f"{kind}_url": storage.download_url(f"{base}{clip['idx']:02}.{ext}")
                                     for kind, ext in (("video", "mp4"), ("captions", "ass"), ("thumbnail", "jpg"))}
                                    if live else {}) for clip in clips]
    return project


def create_upload(request: NewUpload) -> dict:
    """Step 1 of uploading: the client PUTs the file straight to storage, then creates a project with `source`."""
    # ponytail: the random upload id is the only thing tying an upload to its uploader (it's only ever sent to them and
    # the file is gone within a day); key uploads by owner if ids could leak
    upload_id = uuid4()
    return {"source": f"upload:{upload_id}", "method": "PUT", "expires_in": 3600,
            "upload_url": storage.upload_url(f"uploads/{upload_id}", request.content_type),
            "headers": {"Content-Type": request.content_type}}


def discard_upload(source: str):
    if upload := UPLOAD.fullmatch(source):
        storage.delete_prefix(f"uploads/{upload[1]}")


def create_project(owner: str, request: NewProject) -> dict:
    """Queues a project. Raises billing.LimitError if the plan doesn't allow another one this month."""
    billing.check_new_project(owner)
    options = {"n": request.clips, "min_len": request.min_seconds, "max_len": request.max_seconds}
    with db.connect() as c:
        return present(c.execute("insert into projects (owner, source, options) values (%s, %s, %s) returning *",
                                 (owner, request.source, Jsonb(options))).fetchone())


def get_project(owner: str, project_id: UUID) -> dict | None:
    with db.connect() as c:
        project = c.execute("select * from projects where id = %s and owner = %s", (project_id, owner)).fetchone()
        clips = project and c.execute("select * from clips where project_id = %s order by idx", (project_id,)).fetchall()
    return project and present(project, clips)


def list_projects(owner: str, limit: int = 50) -> list[dict]:
    with db.connect() as c:
        return [present(p) for p in c.execute("""
            select p.*, (select count(*) from clips where project_id = p.id) as clip_count
            from projects p where owner = %s order by created_at desc limit %s""", (owner, limit))]


def cancel_project(owner: str, project_id: UUID) -> dict | None:
    """Queued projects cancel at once; running ones stop at their next step. None if missing or already finished."""
    with db.connect() as c:
        project = c.execute("""
            update projects set cancel_requested = true, updated_at = now(),
                status = case when status = 'queued' then 'cancelled' else status end,
                finished_at = case when status = 'queued' then now() end
            where id = %s and owner = %s and status not in ('completed', 'failed', 'cancelled') returning *""",
                            (project_id, owner)).fetchone()
    if project and project["status"] == "cancelled":
        discard_upload(project["source"])
    return project and present(project)


def delete_project(owner: str, project_id: UUID) -> dict | None:
    """Deletes a project with its clips and files. None if missing, still being processed (cancel it first) or with
    posts waiting to go out (they'd still go out, with no way left to follow or unschedule them: unschedule first)."""
    with db.connect() as c:
        project = c.execute("""delete from projects where id = %s and owner = %s and status <> all(%s) and not exists (
                                   select 1 from publications where project_id = projects.id
                                       and status not in ('sent', 'error'))
                               returning *""", (project_id, owner, RUNNING)).fetchone()
    if project:  # row first: if storage fails now, the bucket lifecycle rules still remove the files
        storage.delete_prefix(f"projects/{project_id}/")
        discard_upload(project["source"])
    return project


def update_clip(owner: str, project_id: UUID, idx: int, edit: ClipEdit) -> dict | None:
    """Approve/reject a clip and/or replace its copy. Returns the clip row (no file links), None if missing."""
    with db.connect() as c:
        return c.execute("""
            update clips set review = coalesce(%s, review), title = coalesce(%s, title),
                description = coalesce(%s, description), hashtags = coalesce(%s, hashtags), posts = coalesce(%s, posts)
            where project_id = %s and idx = %s and project_id in (select id from projects where owner = %s)
            returning *""",
                         (edit.review, edit.title, edit.description,
                          None if edit.hashtags is None else Jsonb(edit.hashtags),
                          None if edit.posts is None else Jsonb(edit.posts.model_dump()), project_id, idx,
                          owner)).fetchone()


class _Pipe(io.RawIOBase):
    """Write end for zipfile: collects what it writes so a generator can pass it on in pieces."""

    def __init__(self):
        self.data = bytearray()

    def writable(self):
        return True

    def write(self, b):
        self.data += b
        return len(b)

    def take(self) -> bytes:
        taken, self.data = bytes(self.data), bytearray()
        return taken


def content_package(owner: str, project_id: UUID) -> Iterator[bytes] | None:
    """A ZIP of every clip that wasn't rejected: videos/, captions/, thumbnails/ and metadata/clips.csv + clips.json
    with the current (edited) copy, plus calendar.csv once anything is scheduled or posted, streamed straight from
    storage. None if there's nothing to package: the project
    is missing, unfinished or expired, or every clip was rejected."""
    # ponytail: the bytes flow through the API server; build the ZIP in the worker and hand out a link if bandwidth
    # or open connections become a problem
    project = get_project(owner, project_id)
    clips = [clip for clip in (project or {}).get("clips", []) if clip["review"] != "rejected"]
    if not clips or "video_url" not in clips[0]:
        return None

    def stream():
        pipe = _Pipe()
        with zipfile.ZipFile(pipe, "w") as package:  # stored, not deflated: MP4 and JPEG are already compressed
            for clip in clips:
                for folder, ext in (("videos", "mp4"), ("captions", "ass"), ("thumbnails", "jpg")):
                    name = f"clip{clip['idx']:02}.{ext}"
                    with package.open(f"{folder}/{name}", "w") as entry:
                        for chunk in storage.chunks(f"projects/{project_id}/{name}"):
                            entry.write(chunk)
                            if data := pipe.take():
                                yield data
            copy = ["idx", "title", "hook", "description", "hashtags"]
            facts = ["start_s", "end_s", "score", "review", "reason"]
            table = io.StringIO()
            writer = csv.DictWriter(table, [*copy, *clipper.Posts.model_fields, *facts])  # one column per platform
            writer.writeheader()
            for clip in clips:
                writer.writerow({k: clip[k] for k in copy + facts} | clip["posts"] | {"hashtags": " ".join(clip["hashtags"])})
            package.writestr("metadata/clips.csv", table.getvalue().encode("utf-8-sig"))  # BOM so Excel reads UTF-8
            package.writestr("metadata/clips.json", json.dumps(
                [{k: clip[k] for k in [*copy, "posts", *facts]} for clip in clips], indent=2, ensure_ascii=False))
            with db.connect() as c:  # every post of the project, scheduled or not, in time order (UTC)
                posts = c.execute("""
                    select coalesce(p.due_at, p.created_at) as due_at, p.clip_idx, c.title,
                        case p.service when 'twitter' then 'x' else p.service end as network, p.channel_name,
                        p.status, p.external_link, p.error
                    from publications p join clips c on c.project_id = p.project_id and c.idx = p.clip_idx
                    where p.project_id = %s order by 1, p.clip_idx, network""", (project_id,)).fetchall()
            if posts:
                table = io.StringIO()
                writer = csv.DictWriter(table, list(posts[0]))
                writer.writeheader()
                writer.writerows(posts)
                package.writestr("calendar.csv", table.getvalue().encode("utf-8-sig"))
        yield pipe.take()

    return stream()


def load_transcript(key: str) -> dict | None:
    with db.connect() as c:
        row = c.execute("select data from transcripts where source_key = %s", (key,)).fetchone()
    return row and row["data"]


def save_transcript(key: str, transcript: dict):
    with db.connect() as c:
        c.execute("insert into transcripts (source_key, language, data) values (%s, %s, %s) on conflict do nothing",
                  (key, transcript["language"], Jsonb(transcript)))


def claim() -> dict | None:
    """Requeue projects whose worker died (no heartbeat for 2 min), then take the oldest due queued project."""
    with db.connect() as c:
        c.execute("""
            update projects set updated_at = now(), error = 'worker stopped responding',
                status = case when cancel_requested then 'cancelled'
                              when attempts >= max_attempts then 'failed' else 'queued' end,
                finished_at = case when cancel_requested or attempts >= max_attempts then now() end
            where status = any(%s) and heartbeat_at < now() - interval '2 minutes'""", (RUNNING,))
        return c.execute("""
            update projects set status = 'downloading', detail = '', attempts = attempts + 1,
                heartbeat_at = now(), updated_at = now()
            where id = (select id from projects where status = 'queued' and run_after <= now()
                        order by created_at for update skip locked limit 1)
            returning *""").fetchone()


def run_job(project: dict):
    """Process a claimed project to completed, cancelled, queued-for-retry (with backoff) or failed. Local files are
    always removed afterwards; uploaded sources are removed once the project reaches a final state."""
    # ponytail: if a worker stalls past the heartbeat window its job can run twice; add a claim token if seen
    pid, finished, temp = project["id"], threading.Event(), TMP / str(project["id"])

    def heartbeat():  # proves the process is alive; a crashed worker stops beating and claim() requeues its job
        while not finished.wait(30):
            try:
                with db.connect() as c:
                    c.execute("update projects set heartbeat_at = now() where id = %s", (pid,))
            except Exception:
                traceback.print_exc()

    def progress(stage: str, detail: str = ""):
        with db.connect() as c:
            project_now = c.execute("update projects set status = %s, detail = %s, updated_at = now() where id = %s"
                                    " returning cancel_requested", (stage, detail, pid)).fetchone()
        if project_now["cancel_requested"]:
            raise Cancelled

    threading.Thread(target=heartbeat, daemon=True).start()
    options, source, final = project["options"], project["source"], True
    try:
        left = billing.allowance(project["owner"])  # checked again: the plan may have changed or run out since queued
        if upload := UPLOAD.fullmatch(source):
            source = str(temp / "upload")
            storage.get(f"uploads/{upload[1]}", temp / "upload")
        key, out, clips = clipper.run(source, temp / "out", options["n"], options["min_len"], options["max_len"],
                                      progress=progress, load_transcript=load_transcript,
                                      save_transcript=save_transcript, work_root=temp / "work",
                                      max_seconds=left["seconds"], max_clips=left["clips"])
        progress("packaging", f"{len(clips)} clips")
        storage.delete_prefix(f"projects/{pid}/")  # leftovers from an earlier attempt
        for path in sorted(out.iterdir()):
            storage.put(path, f"projects/{pid}/{path.name}", CONTENT_TYPES[path.suffix])
        with db.connect() as c, c.transaction():
            c.execute("delete from clips where project_id = %s", (pid,))
            for i, clip in enumerate(clips, 1):
                c.execute("""insert into clips (project_id, idx, start_s, end_s, score, reason, hook, title,
                                                description, hashtags, posts)
                             values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                          (pid, i, clip.start, clip.end, clip.score, clip.reason, clip.hook, clip.title,
                           clip.description, Jsonb(clip.hashtags), Jsonb(clip.posts.model_dump())))
            c.execute("update projects set status = 'completed', detail = '', error = null, source_key = %s,"
                      " finished_at = now(), updated_at = now() where id = %s", (key, pid))
    except Cancelled:
        with db.connect() as c:
            c.execute("update projects set status = 'cancelled', detail = '', finished_at = now(), updated_at = now()"
                      " where id = %s", (pid,))
    except Exception as e:
        final = isinstance(e, PERMANENT) or project["attempts"] >= project["max_attempts"]
        # PermanentError messages are written for people (no speech, plan limits): show them as the detail
        reason = str(e) if isinstance(e, clipper.PermanentError) else ""
        with db.connect() as c:
            c.execute("""update projects set status = %s, detail = %s, error = %s, updated_at = now(),
                             run_after = now() + make_interval(mins => %s),
                             finished_at = case when %s then now() end
                         where id = %s""",
                      ("failed" if final else "queued", reason, f"{type(e).__name__}: {e}"[:2000],
                       2 ** project["attempts"], final, pid))
        if final:
            storage.delete_prefix(f"projects/{pid}/")
        traceback.print_exc()
    finally:
        finished.set()
        shutil.rmtree(temp, ignore_errors=True)
        if final:
            discard_upload(project["source"])


def work(concurrency: int):
    # ponytail: fixed thread count; size it to CPU/RAM (each job runs one ffmpeg) and per-plan limits later
    import publishing  # here rather than at the top: publishing imports this module
    db.migrate()

    def send_posts():  # the content calendar's queued posts, one at a time (Buffer allows 100 requests per 15 minutes)
        while True:
            try:
                if not publishing.send_queued():
                    time.sleep(5)
            except Exception:  # Buffer or storage can't be used right now: the post is back in the queue
                # ponytail: fixed one-minute wait; use Buffer's Retry-After if limit hits start costing requests
                traceback.print_exc()
                time.sleep(60)

    def loop():
        while True:
            try:
                project = claim()
            except Exception:  # database unreachable: keep trying rather than dying
                traceback.print_exc()
                time.sleep(10)
                continue
            if project:
                print(f"project {project['id']} attempt {project['attempts']}: {project['source']}", flush=True)
                try:
                    run_job(project)
                except Exception:  # e.g. storage down during cleanup: log it, the heartbeat stops, claim() recovers
                    traceback.print_exc()
                print(f"project {project['id']} done", flush=True)
            else:
                time.sleep(2)

    for _ in range(concurrency):
        threading.Thread(target=loop, daemon=True).start()
    threading.Thread(target=send_posts, daemon=True).start()
    print(f"worker running, {concurrency} job(s) at a time", flush=True)
    while True:
        time.sleep(3600)  # main thread stays interruptible (Ctrl+C); jobs cut off mid-way are requeued by claim()


if __name__ == "__main__":
    clipper.load_env()
    required = ("GROQ_API_KEY", "DEEPSEEK_API_KEY", "S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_BUCKET")
    if missing := [k for k in required if not os.environ.get(k)]:
        sys.exit(f"missing {', '.join(missing)} in {clipper.HERE / '.env'}")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--concurrency", type=int, default=int(os.environ.get("WORKER_CONCURRENCY", 1)))
    work(parser.parse_args().concurrency)
