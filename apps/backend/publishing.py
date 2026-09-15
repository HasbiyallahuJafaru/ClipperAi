"""Publishing approved clips through Buffer's GraphQL API (https://developers.buffer.com). Shared by the REST API and
the MCP server.

The workspace's Buffer account is BUFFER_API_KEY in .env. Social accounts are connected inside Buffer, never here, so
YT-Clipper never sees a social password.

Buffer reads the video from a link when the post is created and again when it goes out, and it can't read signed
links. So each post gets its own copy of the clip in the public bucket (storage.public_copy, named after the
publication id), deleted once the post has been sent, has failed or is unscheduled.

The content calendar (plan, schedule) spreads approved clips over posting days and times. Its posts are queued here
first and handed to Buffer by the worker (send_queued), so a month of posts never holds up a request."""
import json
import os
import urllib.error
import urllib.request
from datetime import date, datetime, time, timedelta, timezone
from itertools import islice
from typing import Annotated
from uuid import UUID
from zoneinfo import ZoneInfo

import psycopg
from pydantic import AwareDatetime, BaseModel, Field, field_validator

import db
import jobs
import storage

API = "https://api.buffer.com"  # test_jobs.py and `dev.py --fake-buffer` point this at fake_buffer.py
# Buffer's name for a network -> which of the clip's written posts it gets
SERVICES = {"tiktok": "tiktok", "instagram": "instagram", "youtube": "youtube", "linkedin": "linkedin",
            "facebook": "facebook", "twitter": "x"}
AHEAD = timedelta(days=30)  # the public copy must still exist when the post goes out (storage.PUBLIC_DAYS is 45)
# a calendar post is queued before Buffer sees it: leave time to wait out Buffer's request limit (15 minutes at worst)
EARLIEST = timedelta(minutes=30)
CREATE = """mutation($input: CreatePostInput!) { createPost(input: $input) {
    ... on PostActionSuccess { post { id status dueAt sentAt externalLink error { message } } }
    ... on MutationError { message } } }"""
POST = "query($id: PostId!) { post(input: {id: $id}) { id status dueAt sentAt externalLink error { message } } }"
DELETE = """mutation($id: PostId!) { deletePost(input: {id: $id}) {
    ... on DeletePostSuccess { id } ... on MutationError { message } } }"""


class PublishError(Exception):
    """Why something can't be published, written for people. `status` is the HTTP status the API answers with;
    `code` is Buffer's error code when Buffer said no."""

    def __init__(self, message: str, status: int = 409, code: str | None = None):
        super().__init__(message)
        self.status, self.code = status, code


class Publish(BaseModel):
    channels: list[str] = Field(min_length=1, max_length=20, description="Buffer channel ids, from GET /api/publishing/channels")
    due_at: AwareDatetime | None = Field(None, description="When to post (ISO 8601 with time zone); omit to post now")


class Calendar(BaseModel):
    channels: list[str] = Field(min_length=1, max_length=20, description="Buffer channel ids, from GET /api/publishing/channels")
    days: list[Annotated[int, Field(ge=1, le=7)]] = Field(min_length=1, max_length=7, description="Posting days, 1 = Monday to 7 = Sunday")
    times: list[time] = Field(min_length=1, max_length=6, description="Posting times on those days, e.g. 09:00")
    start: date = Field(description="First day posts can go out")
    timezone: str = Field(description="Time zone of the days and times, e.g. Europe/London")

    @field_validator("timezone")
    @classmethod
    def known(cls, name: str) -> str:
        try:
            ZoneInfo(name)
        except (KeyError, ValueError):  # ZoneInfoNotFoundError is a KeyError; paths and other odd keys are ValueErrors
            raise ValueError(f"unknown time zone {name!r}") from None
        return name


def call(query: str, **variables) -> dict:
    """One GraphQL request to Buffer. Raises PublishError with a readable reason for anything but data."""
    if not os.environ.get("BUFFER_API_KEY"):
        raise PublishError("Buffer isn't connected yet. Create an API key in Buffer (Settings, then API) and set"
                           " BUFFER_API_KEY in the backend's .env.")
    request = urllib.request.Request(API, json.dumps({"query": query, "variables": variables}).encode(), {
        "Content-Type": "application/json", "Authorization": f"Bearer {os.environ['BUFFER_API_KEY']}"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = json.load(response)
    except urllib.error.HTTPError as e:
        if e.code == 401:
            raise PublishError("Buffer didn't accept the API key. It may have been deleted: create a new one in Buffer"
                               " and update BUFFER_API_KEY.", 502) from e
        if e.code == 429:
            minutes = -(-int(e.headers.get("Retry-After") or 60) // 60)
            raise PublishError(f"Buffer's request limit is used up for now. Try again in {minutes} minute"
                               f"{'' if minutes == 1 else 's'}.", 502) from e
        raise PublishError(f"Buffer had a problem ({e.code}). Try again in a minute.", 502) from e
    except (OSError, ValueError) as e:  # no connection, timeout, or a reply that isn't JSON
        raise PublishError("Couldn't reach Buffer. Try again in a minute.", 502) from e
    if errors := body.get("errors"):
        raise PublishError(f"Buffer: {errors[0]['message']}", 502, errors[0].get("extensions", {}).get("code"))
    return body["data"]


def allowed(owner: str):
    """BUFFER_API_KEY posts to one person's social accounts, so only the owners listed in BUFFER_OWNERS (Clerk ids,
    comma-separated; `*` = everyone, for the fake Buffer in dev.py) may publish through it."""
    # ponytail: one Buffer account for the whole deployment; give each account its own publishing connection before
    # anyone else signs up
    listed = os.environ.get("BUFFER_OWNERS", "")
    if listed != "*" and owner not in listed.split(","):
        raise PublishError("Publishing isn't connected for your account yet.")


def channels(owner: str) -> list[dict]:
    """The social accounts connected in Buffer. `usable`: YT-Clipper can post clips there (a network we write copy
    for, connected, not locked by Buffer's plan, and not a personal Instagram profile: Buffer only sends those a
    reminder to post by hand)."""
    allowed(owner)
    found = []
    for organization in call("{ account { organizations { id } } }")["account"]["organizations"]:
        found += call("""query($id: OrganizationId!) { channels(input: {organizationId: $id}) {
                             id service type name displayName isDisconnected isLocked } }""",
                      id=organization["id"])["channels"]
    return [c | {"usable": c["service"] in SERVICES and not c["isDisconnected"] and not c["isLocked"]
                 and not (c["service"] == "instagram" and c["type"] == "profile")} for c in found]


def ready(owner: str, channel_ids: list[str]) -> list[dict]:
    """The chosen channels, once it's certain publishing is set up and every one of them can take clips."""
    allowed(owner)
    if not (os.environ.get("S3_PUBLIC_BUCKET") and os.environ.get("S3_PUBLIC_URL")):
        raise PublishError("Publishing isn't set up yet: Buffer needs a public bucket for videos. Set S3_PUBLIC_BUCKET"
                           " and S3_PUBLIC_URL in the backend's .env.")
    by_id = {c["id"]: c for c in channels(owner)}
    chosen = [by_id.get(i) for i in dict.fromkeys(channel_ids)]
    if not all(c and c["usable"] for c in chosen):
        raise PublishError("One of those channels can't be used any more. Reload the page and choose again.", 422)
    return chosen


def schedule_until(project: dict) -> datetime | None:
    """Latest time a post can go out, or None if the project has no clip files to publish."""
    live = project.get("files_expire_at") and project["files_expire_at"] > datetime.now(timezone.utc)
    return datetime.now(timezone.utc) + AHEAD if live else None


def post_input(clip: dict, channel: dict, video_url: str, due_at: datetime | None) -> dict:
    service = channel["service"]
    # YouTube requires a title (100 characters at most) and a category
    # ponytail: every clip is "People & Blogs" (22, YouTube's upload default); let the copywriter pick one if it matters
    metadata = {"youtube": {"title": clip["title"][:100], "categoryId": "22"},
                "instagram": {"type": "reel", "shouldShareToFeed": True}, "facebook": {"type": "reel"}}.get(service)
    video = {"url": video_url}
    if service in ("instagram", "tiktok"):  # the only networks that take a cover frame; ours is the frame at 1 s
        video["metadata"] = {"thumbnailOffset": 1000}
    return {"channelId": channel["id"], "text": clip["posts"][SERVICES[service]], "assets": [{"video": video}],
            "schedulingType": "automatic", "needsApproval": False,
            "mode": "customScheduled" if due_at else "shareNow", "dueAt": due_at and due_at.isoformat()} | (
        {"metadata": {service: metadata}} if metadata else {})


def video_name(publication_id: UUID) -> str:
    return f"{publication_id}.mp4"  # the post's copy in the public bucket: unguessable, and one per post


def save(publication_id: UUID, post: dict | None = None, error: str | None = None) -> dict:
    """Records Buffer's view of a post, or why it failed. Once it's sent or failed, its public copy goes."""
    # ponytail: copies of posts nobody looks at again are only removed by the public bucket's 45-day rule
    if post is None:
        post = {"id": None, "status": "error", "dueAt": None, "sentAt": None, "externalLink": None, "error": None}
    with db.connect() as c:
        row = c.execute("""
            update publications set buffer_post_id = coalesce(%s, buffer_post_id), status = %s,
                due_at = coalesce(%s, due_at), sent_at = %s, external_link = %s, error = %s, checked_at = now()
            where id = %s returning *""",
                        (post["id"], post["status"], post["dueAt"], post["sentAt"], post["externalLink"],
                         error or (post["error"] or {}).get("message"), publication_id)).fetchone()
    if post["status"] in ("sent", "error"):
        storage.delete_public(video_name(publication_id))
    return row


def publish(owner: str, project_id: UUID, idx: int, request: Publish) -> list[dict] | None:
    """Sends an approved clip to Buffer channels, now or at `due_at`. Returns one publication per channel, including
    any Buffer refused (status "error" with its reason). None if the clip doesn't exist."""
    project = jobs.get_project(owner, project_id)
    clip = next((c for c in (project or {}).get("clips", []) if c["idx"] == idx), None)
    if clip is None:
        return None
    if clip["review"] != "approved":
        raise PublishError("Approve this clip before publishing it.")
    if "video_url" not in clip:
        raise PublishError("This clip's video has expired, so it can't be published.")
    if request.due_at and request.due_at < datetime.now(timezone.utc):
        raise PublishError("That time has already passed. Pick a time in the future.", 422)
    if request.due_at and request.due_at > schedule_until(project):
        raise PublishError(f"Posts can be scheduled up to {AHEAD.days} days ahead. Pick an earlier time.", 422)
    chosen = ready(owner, request.channels)
    with db.connect() as c:
        taken = [r["channel_name"] for r in c.execute("""
            select channel_name from publications where project_id = %s and clip_idx = %s and channel_id = any(%s)
                and status <> 'error'""", (project_id, idx, request.channels))]
    if taken:
        raise PublishError(f"This clip is already scheduled or posted on {', '.join(taken)}. Unschedule it there first.")

    published = []
    for channel in chosen:
        try:
            with db.connect() as c:
                row = c.execute("""insert into publications (project_id, clip_idx, channel_id, service, channel_name, due_at)
                                   values (%s, %s, %s, %s, %s, %s) returning *""",
                                (project_id, idx, channel["id"], channel["service"],
                                 channel["displayName"] or channel["name"], request.due_at)).fetchone()
        except psycopg.errors.UniqueViolation:  # a second submit is already sending it there
            continue
        # ponytail: if Buffer creates the post but the reply times out, the row says error and a retry posts twice
        video_url = storage.public_copy(f"projects/{project_id}/clip{idx:02}.mp4", video_name(row["id"]))
        try:
            result = call(CREATE, input=post_input(clip, channel, video_url, request.due_at))["createPost"]
        except PublishError as e:  # key, limit or connection trouble: the remaining channels would fail the same way
            save(row["id"], error=str(e))
            raise
        published.append(save(row["id"], result["post"]) if "post" in result else save(row["id"], error=result["message"]))
    return published


def slots(request: Calendar, earliest: datetime, until: datetime):
    """The calendar's posting times in order: each chosen time on each chosen weekday from `start`, in the request's
    time zone (so daylight saving is followed), that falls between `earliest` and `until`."""
    zone = ZoneInfo(request.timezone)
    day = max(request.start, earliest.astimezone(zone).date())
    while datetime.combine(day, time(), zone) <= until:
        if day.isoweekday() in request.days:
            for at in sorted(datetime.combine(day, t, zone) for t in set(request.times)):
                if earliest <= at <= until:
                    yield at.astimezone(timezone.utc)
        day += timedelta(days=1)


def plan(owner: str, project_id: UUID, request: Calendar) -> dict | None:
    """The calendar before anything is sent: approved clips that aren't scheduled or posted yet, in clip order, one per
    posting time up to 30 days ahead, skipping times the chosen channels already have a post at (from any project).
    `left`: the clips that didn't fit. None if the project doesn't exist."""
    project = jobs.get_project(owner, project_id)
    if project is None:
        return None
    until = schedule_until(project)
    if until is None:
        raise PublishError("This project's videos have expired, so its clips can't be scheduled.")
    with db.connect() as c:
        taken = {r["clip_idx"] for r in c.execute(
            "select clip_idx from publications where project_id = %s and status <> 'error'", (project_id,))}
        busy = {r["due_at"] for r in c.execute("""select due_at from publications
            where channel_id = any(%s) and status <> 'error' and due_at > now()""", (request.channels,))}
    approved = [clip for clip in project["clips"] if clip["review"] == "approved"]
    clips = [clip for clip in approved if clip["idx"] not in taken]
    if not clips:
        raise PublishError("Every approved clip is already scheduled or posted." if approved
                           else "Approve the clips you want to schedule first.")
    free = (at for at in slots(request, datetime.now(timezone.utc) + EARLIEST, until) if at not in busy)
    due = list(islice(free, len(clips)))
    if not due:
        raise PublishError(f"None of those days and times fall within the next {AHEAD.days} days. Pick an earlier"
                           " start date.", 422)
    return {"posts": [{"clip_idx": clip["idx"], "title": clip["title"], "due_at": at} for clip, at in zip(clips, due)],
            "left": [clip["idx"] for clip in clips[len(due):]]}


def schedule(owner: str, project_id: UUID, request: Calendar) -> list[dict] | None:
    """Puts the plan on the calendar: one queued post per clip and channel, which the worker hands to Buffer within
    moments (send_queued). Returns the queued posts; None if the project doesn't exist."""
    planned = plan(owner, project_id, request)
    if planned is None:
        return None
    chosen = ready(owner, request.channels)
    queued = []
    with db.connect() as c, c.transaction():
        for post in planned["posts"]:
            for channel in chosen:  # the same calendar sent twice at once queues each post only once
                queued += c.execute("""
                    insert into publications (project_id, clip_idx, channel_id, service, channel_name, due_at, status)
                    values (%s, %s, %s, %s, %s, %s, 'queued')
                    on conflict (project_id, clip_idx, channel_id) where status <> 'error' do nothing returning *""",
                                    (project_id, post["clip_idx"], channel["id"], channel["service"],
                                     channel["displayName"] or channel["name"], post["due_at"])).fetchall()
    return queued


def send_queued() -> bool:
    """The worker's half of the calendar: hands the queued post that's due first to Buffer. False if none is waiting.
    Raises when Buffer or storage can't be used right now (request limit, key, outage); the post goes back in the
    queue and the caller should wait before trying again."""
    with db.connect() as c:
        row = c.execute("""update publications set status = 'sending', checked_at = now()
                           where id = (select id from publications where status = 'queued' order by due_at
                                       for update skip locked limit 1)
                           returning *""").fetchone()
    if row is None:
        return False
    if row["due_at"] < datetime.now(timezone.utc) + timedelta(minutes=1):
        save(row["id"], error="This post couldn't be handed to Buffer before its time. Schedule it again.")
        return True
    # ponytail: sent even if the clip was un-approved after scheduling; check clip["review"] here if that happens
    with db.connect() as c:
        clip = c.execute("select * from clips where project_id = %s and idx = %s",
                         (row["project_id"], row["clip_idx"])).fetchone()
    try:
        video_url = storage.public_copy(f"projects/{row['project_id']}/clip{row['clip_idx']:02}.mp4",
                                        video_name(row["id"]))
        result = call(CREATE, input=post_input(clip, {"id": row["channel_id"], "service": row["service"]}, video_url,
                                               row["due_at"]))["createPost"]
    except Exception as e:
        if isinstance(e, PublishError) and isinstance(e.__cause__, TimeoutError):
            # Buffer received the post but never answered, so it may exist: sending it again could post it twice
            save(row["id"], error="Buffer didn't answer in time, so this post may not be scheduled. Check Buffer"
                                  " before scheduling it again.")
            return True
        with db.connect() as c:
            c.execute("update publications set status = 'queued' where id = %s", (row["id"],))
        raise
    save(row["id"], result["post"]) if "post" in result else save(row["id"], error=result["message"])
    return True


def publications(owner: str, project_id: UUID) -> dict | None:
    """The project's posts, newest state first checked with Buffer for posts whose time has come (at most once a
    minute each; last known state if Buffer can't be reached). None if the project doesn't exist."""
    with db.connect() as c:
        project = c.execute("select * from projects where id = %s and owner = %s", (project_id, owner)).fetchone()
        due = c.execute("""select * from publications where project_id = %s and status not in ('sent', 'error')
                               and buffer_post_id is not null and coalesce(due_at, created_at) <= now()
                               and checked_at < now() - interval '1 minute'""", (project_id,)).fetchall()
    if project is None:
        return None
    try:
        for row in due:
            try:
                save(row["id"], call(POST, id=row["buffer_post_id"])["post"])
            except PublishError as e:
                if e.code != "NOT_FOUND":
                    raise
                with db.connect() as c:  # deleted inside Buffer
                    c.execute("delete from publications where id = %s", (row["id"],))
                storage.delete_public(video_name(row["id"]))
    except PublishError:
        pass
    with db.connect() as c:
        rows = c.execute("select * from publications where project_id = %s order by clip_idx, created_at",
                         (project_id,)).fetchall()
    return {"publications": rows, "schedule_until": schedule_until(jobs.present(project))}


def remove(owner: str, publication_id: UUID) -> dict | None:
    """Unschedules a post (deletes it from Buffer) or clears a failed attempt. None if missing."""
    with db.connect() as c:
        row = c.execute("""select p.* from publications p join projects j on j.id = p.project_id
                           where p.id = %s and j.owner = %s""", (publication_id, owner)).fetchone()
    if row is None:
        return None
    if row["status"] == "queued":  # not in Buffer yet, unless the worker takes it this very moment
        with db.connect() as c:
            if c.execute("delete from publications where id = %s and status = 'queued'", (publication_id,)).rowcount:
                storage.delete_public(video_name(publication_id))  # left by an attempt that was put back in the queue
                return row
        raise PublishError("This post is being handed to Buffer right now. Try again in a moment.")
    if row["buffer_post_id"] and row["status"] in ("sending", "sent"):
        raise PublishError("This post has already gone out. Delete it on the network itself.")
    if row["buffer_post_id"] and row["status"] != "error":
        result = call(DELETE, id=row["buffer_post_id"])["deletePost"]
        if "message" in result and "not found" not in result["message"].lower():  # not found: already gone
            raise PublishError(f"Buffer: {result['message']}", 502)
    storage.delete_public(video_name(publication_id))
    with db.connect() as c:
        return c.execute("delete from publications where id = %s returning *", (publication_id,)).fetchone()
