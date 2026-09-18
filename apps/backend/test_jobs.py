"""Job queue, storage and billing checks against a throwaway Postgres (pgserver) and a local S3 (moto).
Needs network for DNS. Run: python test_jobs.py"""
import csv
import io
import json
import os
import socket
import tempfile
import time
import urllib.request
import zipfile
from pathlib import Path
from uuid import uuid4

import pgserver
import psycopg
from moto.server import ThreadedMotoServer

database = pgserver.get_server(tempfile.mkdtemp(), cleanup_mode="delete")
with socket.socket() as s:
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
s3 = ThreadedMotoServer(ip_address="127.0.0.1", port=port, verbose=False)
s3.start()
os.environ |= {"DATABASE_URL": database.get_uri(), "S3_ENDPOINT": f"http://127.0.0.1:{port}", "S3_BUCKET": "clips",
               "S3_ACCESS_KEY_ID": "test", "S3_SECRET_ACCESS_KEY": "test", "S3_PUBLIC_BUCKET": "clips-public",
               "S3_PUBLIC_URL": f"http://127.0.0.1:{port}/clips-public"}  # moto serves objects without signatures

import billing  # noqa: E402  (after the env points at the test services)
import clipper  # noqa: E402
import db  # noqa: E402
import jobs  # noqa: E402
import storage  # noqa: E402
from jobs import NewProject, NewUpload  # noqa: E402

real_fetch_title, jobs.fetch_title_async = jobs.fetch_title_async, lambda *_: None  # no live oEmbed in tests

ME, OTHER = "user_test_me", "org_test_other"  # Clerk owners: a signed-in user, and someone else's organization


def http(method, url, data=None, headers=None):
    with urllib.request.urlopen(urllib.request.Request(url, data, headers or {}, method=method)) as response:
        return response.read()


def rejects(make, why):
    try:
        make()
    except ValueError:
        return
    raise AssertionError(why)


db.migrate()
db.migrate()  # second run is a no-op
import boto3  # noqa: E402  (moto rejects region "auto" on bucket creation only; R2 buckets exist already)
for name in ("clips", "clips-public"):
    boto3.client("s3", endpoint_url=os.environ["S3_ENDPOINT"], region_name="us-east-1", aws_access_key_id="test",
                 aws_secret_access_key="test").create_bucket(Bucket=name)
storage.client().put_bucket_policy(Bucket="clips-public", Policy=json.dumps({"Statement": [  # R2: public access switch
    {"Effect": "Allow", "Principal": "*", "Action": "s3:GetObject", "Resource": "arn:aws:s3:::clips-public/*"}]}))
storage.setup()
rules = storage.client().get_bucket_lifecycle_configuration(Bucket="clips")["Rules"]
assert {r["ID"]: r.get("Expiration", {}).get("Days") for r in rules} == {"uploads": 1, "projects": 30,
                                                                         "unfinished-uploads": None}
rules = storage.client().get_bucket_lifecycle_configuration(Bucket="clips-public")["Rules"]
assert [(r["ID"], r["Expiration"]["Days"]) for r in rules] == [("published", 45)]

for bad in ["C:/Windows/win.ini", "file:///etc/passwd", "http://localhost:8000/v.mp4", "http://10.0.0.5/v.mp4",
            "http://169.254.169.254/latest/meta-data", "https://no-such-host.invalid/v", "upload:not-a-uuid"]:
    rejects(lambda: NewProject(source=bad), f"accepted source {bad}")
rejects(lambda: NewProject(source="https://example.com/v", min_seconds=60, max_seconds=30), "accepted min > max")
rejects(lambda: NewUpload(content_type="text/html", size=10), "accepted a non-video upload")
rejects(lambda: NewUpload(content_type="video/mp4", size=6 * 1024**3), "accepted a 6 GB upload")


def refuses(make, why, words):
    try:
        make()
    except billing.LimitError as e:
        assert words in str(e), str(e)
        return
    raise AssertionError(why)


# plans: nothing starts without one; choosing one activates it at once and charges nothing; one active at a time
refuses(lambda: jobs.create_project(ME, NewProject(source="https://example.com/video")), "started without a plan",
        "Choose a plan")
rejects(lambda: billing.Subscribe(plan="free"), "accepted an unknown plan")
creator = billing.subscribe(ME, "creator")
assert creator["status"] == "active" and creator["price_cents"] == 1500 and creator["charged_cents"] == 0
assert billing.subscribe(ME, "creator")["id"] == creator["id"], "choosing the current plan changes nothing"
business = billing.subscribe(ME, "business")
assert billing.current(ME)["id"] == business["id"]
assert [s["plan"] for s in billing.summary(ME)["history"]] == ["business", "creator"]
try:
    with db.connect() as c:
        c.execute("insert into subscriptions (owner, plan, price_cents) values (%s, 'pro', 3900)", (ME,))
    raise AssertionError("allowed two active plans")
except psycopg.errors.UniqueViolation:
    pass
# plans belong to one account: someone else has none, and choosing one leaves mine alone
assert billing.current(OTHER) is None and billing.summary(OTHER)["history"] == []
refuses(lambda: jobs.create_project(OTHER, NewProject(source="https://example.com/video")), "other account has no plan",
        "Choose a plan")
assert billing.subscribe(OTHER, "creator")["owner"] == OTHER and billing.current(ME)["id"] == business["id"]
assert billing.cancel(OTHER)["owner"] == OTHER and billing.current(ME)["id"] == business["id"]


def upload(data=b"fake video"):
    ticket = jobs.create_upload(NewUpload(content_type="video/mp4", size=len(data)))
    rejects(lambda: NewProject(source=ticket["source"]), "accepted an upload that was never PUT")
    http("PUT", ticket["upload_url"], data, ticket["headers"])
    return ticket["source"]


seen, limits, burned = [], [], []


def fake_run(behaviour):
    """Stands in for the real pipeline: writes scratch + output files and reports progress like clipper.run."""
    def run(source, out, n, min_len, max_len, progress, load_transcript, save_transcript, work_root, max_seconds,
            max_clips, captions, orientation="9:16", on_meta=None):
        seen.append(Path(source).read_bytes() if Path(source).is_file() else source)
        limits.append((max_seconds, max_clips))
        burned.append(captions)
        if on_meta is not None:
            on_meta({"title": f"Shared video ({orientation})"})  # like the extractor reporting a YouTube title
        work_root.mkdir(parents=True, exist_ok=True)
        (work_root / "source.mp4").write_bytes(b"downloaded")
        progress("transcribing")
        if behaviour == "crash":
            raise ConnectionError("network down")
        if behaviour == "permanent":
            raise clipper.PermanentError("no speech found")
        if behaviour == "cancel":
            jobs.cancel_project(ME, current["id"])
            progress("rendering")
        out.mkdir(parents=True, exist_ok=True)
        for ext in ("mp4", "ass", "jpg"):
            (out / f"clip01.{ext}").write_bytes(f"clip {ext}".encode())
        (out / "clips.json").write_text("[]")
        posts = clipper.Posts(**dict.fromkeys(clipper.Posts.model_fields, "post"))
        return "Youtube-x", out, [clipper.Clip(start=1, end=31, score=90, reason="r", hook="h", title="t",
                                               description="d", hashtags=["#a"], posts=posts)]
    return run


def status(project):
    return jobs.get_project(ME, project["id"])


def upload_exists(source):
    return storage.size(f"uploads/{source.removeprefix('upload:')}") is not None


# uploaded source, success: worker fetches the upload, clips land in storage behind signed links, local + source cleaned
source = upload()
p = jobs.create_project(ME, NewProject(source=source, clips=3, orientation="1:1"))
assert p["status"] == "queued" and p["message"] == "Waiting to start..."
clipper.run = fake_run("ok")
current = jobs.claim()
assert current["id"] == p["id"] and current["status"] == "downloading" and current["attempts"] == 1
assert jobs.claim() is None, "the same project must not be claimed twice"
jobs.run_job(current)
done = status(p)
assert done["status"] == "completed" and done["message"] == "Ready." and done["source_key"] == "Youtube-x"
assert done["source_title"] == "Shared video (1:1)", "the source's own name is recorded for the UI"
assert done["options"]["orientation"] == "1:1"
assert seen[-1] == b"fake video", "the worker must process the uploaded bytes"
assert limits[-1] == (3000 * 60, 500), "the worker passes the plan's remaining minutes and clips to the engine"
assert burned[-1] is True, "captions are burned in unless the project turns them off"
clip = done["clips"][0]
assert clip["posts"]["x"] == "post" and http("GET", clip["video_url"]) == b"clip mp4"
assert http("GET", clip["captions_url"]) == b"clip ass" and http("GET", clip["thumbnail_url"]) == b"clip jpg"
assert storage.size(f"projects/{p['id']}/clips.json") is not None
assert not (jobs.TMP / str(p["id"])).exists(), "local scratch must be deleted"
assert not upload_exists(source), "the uploaded source video must be deleted after processing"

# an upload never reports a video title, so the AI's best clip title names the project
src = upload()
silent = jobs.create_project(ME, NewProject(source=src, clips=3))
clipper.run = lambda *a, **kw: fake_run("ok")(*a, **{**kw, "on_meta": None})
jobs.run_job(jobs.claim())
assert status(silent)["source_title"] == "t", "an upload with no video title is named by the AI's best clip"
clipper.run = fake_run("ok")

# a link is named from its site's oEmbed answer while it queues, so the page shows the video, not the URL
asked, answer = [], b'{"title": "Blue Eye Samurai | Official Teaser"}'


def fake_oembed(request, timeout=None):
    asked.append(request.full_url if hasattr(request, "full_url") else request)
    return io.BytesIO(answer)


def named(source, reply):
    """Run the real lookup against a canned oEmbed reply and give back the title it stored."""
    global answer
    answer = reply
    project = jobs.create_project(ME, NewProject(source=source))
    assert status(project)["source_title"] is None, "a fresh link project has no title yet"
    urllib.request.urlopen, saved = fake_oembed, urllib.request.urlopen
    try:
        real_fetch_title(project["id"], source)
        for _ in range(50):  # it answers on its own thread
            if status(project)["source_title"]:
                break
            time.sleep(0.1)
    finally:
        urllib.request.urlopen = saved
    title = status(project)["source_title"]
    jobs.delete_project(ME, project["id"])  # keep the project counts below unchanged
    return title


assert named("https://youtu.be/3oCx6HcYz9k?si=x", answer) == "Blue Eye Samurai | Official Teaser"
assert asked[-1].startswith(jobs.OEMBED["youtu.be"]) and "youtu.be%2F3oCx6HcYz9k" in asked[-1], asked[-1]
# each site has its own endpoint, and X answers with the account rather than a title
assert named("https://www.tiktok.com/@a/video/7", b'{"title": "a tiktok"}') == "a tiktok"
assert asked[-1].startswith(jobs.OEMBED["tiktok.com"]), asked[-1]
assert named("https://x.com/federalreserve/status/7", b'{"author_name": "Federal Reserve"}') == "Federal Reserve"
# a site we have no endpoint for is left alone: no request at all, and the page keeps showing the URL
before = len(asked)
assert named("https://example.com/video.mp4", b'{"title": "never asked"}') is None
assert len(asked) == before, "asked a site that has no oEmbed endpoint"

assert (done["files_expire_at"] - done["finished_at"]).days == storage.CLIP_DAYS
with urllib.request.urlopen(clip["video_url"]) as response:  # links save as files; <video> ignores the header
    assert response.headers["Content-Disposition"] == 'attachment; filename="clip01.mp4"'

# review: approve + edit copy, omitted fields untouched, empty hashtags allowed, bad values rejected, missing clip None
assert clip["review"] == "pending"
posts = clip["posts"] | {"x": "edited post"}
edited = jobs.update_clip(ME, p["id"], 1, jobs.ClipEdit(review="approved", title="Better title", posts=posts, hashtags=[]))
assert edited["review"] == "approved" and edited["title"] == "Better title" and edited["hashtags"] == []
assert edited["posts"]["x"] == "edited post" and edited["description"] == "d" and edited["hook"] == "h"
assert jobs.update_clip(ME, p["id"], 1, jobs.ClipEdit(hook="A better opening line"))["hook"] == "A better opening line"
assert jobs.update_clip(ME, p["id"], 1, jobs.ClipEdit(review="rejected"))["title"] == "Better title"
assert status(p)["clips"][0]["review"] == "rejected"
assert jobs.update_clip(ME, p["id"], 99, jobs.ClipEdit(review="approved")) is None
rejects(lambda: jobs.ClipEdit(review="maybe"), "accepted an unknown review state")
rejects(lambda: jobs.ClipEdit(title=""), "accepted an empty title")
rejects(lambda: jobs.ClipEdit(posts={"x": "only one platform"}), "accepted incomplete posts")
# a person's own words are never silently shortened: too long is an error they can see and fix
rejects(lambda: jobs.ClipEdit(posts={n: ("z" * 500 if n == "x" else "ok") for n in clipper.LIMITS}),
        "accepted an x post past its limit")
assert jobs.ClipEdit(posts={n: "ok" for n in clipper.LIMITS}).posts.x == "ok"
first = p
assert [x["clip_count"] for x in jobs.list_projects(ME) if x["id"] == p["id"]] == [1]

# another account can't see, change, download, cancel or delete it
assert jobs.get_project(OTHER, p["id"]) is None and jobs.list_projects(OTHER) == []
assert jobs.update_clip(OTHER, p["id"], 1, jobs.ClipEdit(review="approved")) is None
assert status(p)["clips"][0]["review"] == "rejected", "the other account's edit must not land"
assert jobs.content_package(OTHER, p["id"]) is None and jobs.cancel_project(OTHER, p["id"]) is None
assert jobs.delete_project(OTHER, p["id"]) is None and status(p)

# content package: rejected clips stay out (nothing left -> None); the ZIP carries the files and the edited copy
assert jobs.content_package(ME, p["id"]) is None and jobs.content_package(ME, uuid4()) is None
jobs.update_clip(ME, p["id"], 1, jobs.ClipEdit(review="approved"))
package = zipfile.ZipFile(io.BytesIO(b"".join(jobs.content_package(ME, p["id"]))))
assert sorted(package.namelist()) == ["captions/clip01.ass", "metadata/clips.csv", "metadata/clips.json",
                                      "thumbnails/clip01.jpg", "videos/clip01.mp4"], package.namelist()
assert package.read("videos/clip01.mp4") == b"clip mp4" and package.read("thumbnails/clip01.jpg") == b"clip jpg"
metadata = json.loads(package.read("metadata/clips.json"))
assert metadata[0]["title"] == "Better title" and metadata[0]["posts"]["x"] == "edited post"
row = next(csv.DictReader(io.StringIO(package.read("metadata/clips.csv").decode("utf-8-sig"))))
assert row["x"] == "edited post" and row["review"] == "approved" and row["hook"] == "A better opening line"

# expired files: no links handed out, nothing to package
with db.connect() as c:
    c.execute("update projects set finished_at = now() - interval '31 days' where id = %s", (p["id"],))
assert "video_url" not in status(p)["clips"][0] and jobs.content_package(ME, p["id"]) is None

# transient failure: requeued with backoff, upload kept for the retry; failed + upload deleted once attempts run out
source = upload()
p = jobs.create_project(ME, NewProject(source=source))
clipper.run = fake_run("crash")
jobs.run_job(jobs.claim())
retrying = status(p)
assert retrying["status"] == "queued" and "network down" in retrying["error"]
assert retrying["message"] == jobs.MESSAGES["retrying"]
assert retrying["run_after"] > retrying["updated_at"] and jobs.claim() is None, "backoff must delay the retry"
assert upload_exists(source) and not (jobs.TMP / str(p["id"])).exists()
with db.connect() as c:
    c.execute("update projects set run_after = now(), attempts = max_attempts - 1 where id = %s", (p["id"],))
jobs.run_job(jobs.claim())
assert status(p)["status"] == "failed" and status(p)["finished_at"] and not upload_exists(source)

# permanent error: failed immediately, no retry
p = jobs.create_project(ME, NewProject(source="https://example.com/video"))
clipper.run = fake_run("permanent")
jobs.run_job(jobs.claim())
assert status(p)["status"] == "failed" and status(p)["attempts"] == 1
assert status(p)["detail"] == "no speech found", "a permanent error's message is the reason people see"

# cancel: queued cancels at once (and drops its upload); running stops at the next step; finished can't be cancelled
source = upload()
p = jobs.create_project(ME, NewProject(source=source))
assert jobs.cancel_project(ME, p["id"])["status"] == "cancelled" and jobs.claim() is None and not upload_exists(source)
assert jobs.cancel_project(ME, p["id"]) is None
p = jobs.create_project(ME, NewProject(source="https://example.com/video"))
clipper.run = fake_run("cancel")
current = jobs.claim()
jobs.run_job(current)
assert status(p)["status"] == "cancelled"

# crashed worker: no heartbeat for 2+ minutes -> the next claim requeues and retakes it
p = jobs.create_project(ME, NewProject(source="https://example.com/video"))
jobs.claim()
with db.connect() as c:
    c.execute("update projects set heartbeat_at = now() - interval '5 minutes' where id = %s", (p["id"],))
again = jobs.claim()
assert again["id"] == p["id"] and again["attempts"] == 2

# delete: running projects refuse (cancel first); finished ones go with their clips and stored files
assert jobs.delete_project(ME, again["id"]) is None and status(again)
assert jobs.delete_project(ME, first["id"])["id"] == first["id"]
assert status(first) is None and storage.size(f"projects/{first['id']}/clip01.mp4") is None
with db.connect() as c:  # the row and its clip stay: usage keeps counting a deleted project's hours and clips
    assert c.execute("select count(*) from clips where project_id = %s", (first["id"],)).fetchone()["count"] == 1
assert jobs.delete_project(ME, first["id"]) is None
source = upload()
p = jobs.create_project(ME, NewProject(source=source))
assert jobs.delete_project(ME, p["id"]) and not upload_exists(source), "deleting a queued project drops its upload"

# quota exploit guard: deleting a completed project must not refund its used hours, videos or clips
source = upload()
p = jobs.create_project(ME, NewProject(source=source))
clipper.run = fake_run("ok")
jobs.run_job(jobs.claim())
before = billing.usage(ME)
assert jobs.delete_project(ME, p["id"])["id"] == p["id"]
assert billing.usage(ME) == before, "deleting a project refunded its usage"

# transcript cache round-trip
jobs.save_transcript("Youtube-x", {"language": "en", "segments": [], "words": []})
jobs.save_transcript("Youtube-x", {"language": "de", "segments": [], "words": []})  # first write wins
assert jobs.load_transcript("Youtube-x")["language"] == "en" and jobs.load_transcript("nope") is None

# usage this month: failed/cancelled projects don't use a video, minutes come from completed projects' transcripts,
# last month doesn't count
with db.connect() as c:
    c.execute("delete from projects")
jobs.save_transcript("Youtube-2h", {"language": "en", "words": [], "segments": [{"start": 0, "end": 7200, "text": "x"}]})


def add_project(status_, created="now()", owner=ME):
    with db.connect() as c:
        return c.execute(f"insert into projects (owner, source, options, status, source_key, created_at) values"
                         f" (%s, 'https://example.com/v', '{{}}', %s, 'Youtube-2h', {created}) returning id",
                         (owner, status_)).fetchone()["id"]


for status_ in ("completed", "failed", "cancelled", "queued"):
    add_project(status_)
add_project("completed", "now() - interval '40 days'")
add_project("completed", owner=OTHER)  # someone else's video doesn't use my allowance
assert billing.usage(OTHER) == {"videos": 1, "minutes": 120, "clips": 0}
assert billing.usage(ME) == {"videos": 2, "minutes": 120, "clips": 0}, billing.usage(ME)

# limits: Creator = 5 videos, 5 hours, 50 clips
billing.subscribe(ME, "creator")
assert {k: v for k, v in billing.allowance(ME).items() if k != "plan"} == {"videos": 3, "seconds": 3 * 3600, "clips": 50}
for _ in range(3):
    queued = add_project("queued")
refuses(lambda: jobs.create_project(ME, NewProject(source="https://example.com/video")), "started a 6th video",
        "all 5 videos")
assert billing.allowance(ME)["videos"] == 0, "projects already queued still get processed"
add_project("completed")
add_project("completed")  # 6 hours of video now
refuses(lambda: billing.allowance(ME), "processed past the hours", "hours of video")
with db.connect() as c:  # the worker refuses too, and says why
    c.execute("update projects set status = 'cancelled' where status = 'queued' and id <> %s", (queued,))
jobs.run_job(jobs.claim())
assert status({"id": queued})["status"] == "failed" and "5 hours of video" in status({"id": queued})["detail"]
billing.subscribe(ME, "pro")  # 15 hours, 150 clips
with db.connect() as c:
    c.execute("""insert into clips (project_id, idx, start_s, end_s, score, reason, hook, title, description, hashtags,
                                    posts)
                 select %s, i, 0, 1, 1, '', '', 't', '', '[]', '{}' from generate_series(1, 150) i""", (queued,))
refuses(lambda: billing.allowance(ME), "made clips past the plan", "all 150 clips")
assert billing.cancel(ME)["status"] == "ended" and billing.current(ME) is None and billing.cancel(ME) is None
refuses(lambda: billing.allowance(ME), "processed without a plan", "Choose a plan")

# payments through a fake Payment API (Paystack underneath): Naira price from the daily rate, 30 days per payment,
# and a plan only ever activates through payments.apply(), exactly once per reference
from datetime import datetime, timedelta, timezone  # noqa: E402

import fake_payments  # noqa: E402
import payments  # noqa: E402

pay_api = fake_payments.FakePayments()
payments.API = pay_api.url
os.environ["PAYMENT_API_KEY"] = fake_payments.KEY
with db.connect() as c:  # a fresh rate row, so rate() needs no network
    c.execute("update fx_rate set rate = 1500, at = now() where id = 1")

quote = payments.checkout(ME, "me@example.com", "pro")
assert quote["usd_cents"] == 3900 and quote["kobo"] == 5_850_000 and quote["rate"] == 1500, quote  # $39 at ₦1500/$
assert billing.current(ME) is None, "checkout granted a plan before any money arrived"
raw, signature = pay_api.callback(quote["reference"])
assert not payments.signed(raw, signature[:-1] + "0") and payments.signed(raw, signature)
assert payments.apply(quote["reference"]) and not payments.apply(quote["reference"]), "applied twice"
subscribed = billing.current(ME)
assert subscribed["plan"] == "pro" and subscribed["charged_cents"] == 3900
with db.connect() as c:  # the duplicate apply above changed nothing, and 30 days were granted
    row = c.execute("select * from payments where reference = %s", (quote["reference"],)).fetchone()
    active = c.execute("select * from subscriptions where owner = %s and status = 'active'", (ME,)).fetchone()
    assert row["status"] == "success" and row["applied_at"] is not None
    assert active["expires_at"] - datetime.now(timezone.utc) > timedelta(days=29)

# expiry: once the 30 days run out there is no plan, like a cancellation
with db.connect() as c:
    c.execute("update subscriptions set expires_at = now() - interval '1 day' where owner = %s and status = 'active'",
              (ME,))
assert billing.current(ME) is None
refuses(lambda: billing.allowance(ME), "used an expired plan", "Choose a plan")
with db.connect() as c:  # reconciliation heals a webhook that never arrived: a stale pending payment, already paid
    c.execute("update subscriptions set status = 'ended' where owner = %s", (ME,))
renewal = payments.checkout(ME, "me@example.com", "creator")
pay_api.pay(renewal["reference"])
with db.connect() as c:
    c.execute("update payments set created_at = now() - interval '16 minutes' where reference = %s",
              (renewal["reference"],))
payments.reconcile()
assert billing.current(ME)["plan"] == "creator", "reconciliation didn't apply the paid payment"
# rate fallback: a stale row stays in use when the live rate can't be fetched
with db.connect() as c:
    c.execute("update fx_rate set rate = 1550, at = now() - interval '2 days' where id = 1")
payments.RATE_API = "http://127.0.0.1:9/unreachable"
assert payments.rate() == 1550
# with a payment key set, a plan can no longer be had for free
refuses(lambda: billing.subscribe(ME, "business"), "free subscribe with payments on", "pricing page")
del os.environ["PAYMENT_API_KEY"]

# publishing through a fake Buffer (same answers and refusals as the real one)
import fake_buffer  # noqa: E402
import publishing  # noqa: E402
from datetime import datetime, timedelta, timezone  # noqa: E402

from psycopg.types.json import Jsonb  # noqa: E402

buffer = fake_buffer.FakeBuffer()
publishing.API = buffer.url
now = datetime.now(timezone.utc)
with db.connect() as c:
    pid = c.execute("insert into projects (owner, source, options, status, finished_at) values"
                    " (%s, 'https://example.com/v', '{}', 'completed', now()) returning id", (ME,)).fetchone()["id"]
    for i in (1, 2):
        c.execute("""insert into clips (project_id, idx, start_s, end_s, score, reason, hook, title, description,
                                        hashtags, posts) values (%s, %s, 0, 30, 90, 'r', 'h', %s, 'd', '[]', %s)""",
                  (pid, i, "A very long title " * 10, Jsonb({k: f"{k} post" for k in clipper.Posts.model_fields})))
        storage.client().put_object(Bucket="clips", Key=f"projects/{pid}/clip{i:02}.mp4", Body=f"clip {i}".encode())


def cannot(make, words, status=None):
    try:
        make()
    except publishing.PublishError as e:
        assert words in str(e) and status in (None, e.status), (str(e), e.status)
        return e
    raise AssertionError(f"expected a refusal mentioning {words!r}")


def publish(idx, channels, due_at=None):
    return publishing.publish(ME, pid, idx, publishing.Publish(channels=channels, due_at=due_at))


def rows():
    return {(r["clip_idx"], r["service"]): r for r in publishing.publications(ME, pid)["publications"]}


def public_copy(publication):
    """The post's copy in the public bucket, or None once it's gone."""
    try:
        return http("GET", f"{os.environ['S3_PUBLIC_URL']}/{publication['id']}.mp4")
    except urllib.error.HTTPError:
        return None


# the workspace's Buffer account posts to one person's socials: only the owners in BUFFER_OWNERS may use it
os.environ["BUFFER_OWNERS"] = ME
cannot(lambda: publishing.channels(OTHER), "Connect your Buffer account")
assert publishing.publish(OTHER, pid, 1, publishing.Publish(channels=["channel-tiktok"])) is None, "not their clip"

# connecting: no key and no connection, then a wrong key (what an OAuth failure looks like with keys)
os.environ.pop("BUFFER_API_KEY", None)
cannot(lambda: publishing.channels(ME), "Connect your Buffer account")
os.environ["BUFFER_API_KEY"] = "wrong"
cannot(lambda: publishing.channels(ME), "didn't accept the API key", 502)
os.environ["BUFFER_API_KEY"] = fake_buffer.KEY
usable = {c["id"].removeprefix("channel-"): c["usable"] for c in publishing.channels(ME)}
assert usable == {"tiktok": True, "youtube": True, "instagram": True, "twitter": True, "linkedin": False,
                  "pinterest": False, "instagram-personal": False}, usable
# linkedin is disconnected; Pinterest isn't a network we write for; Buffer won't post to personal Instagram profiles

# only approved clips, only usable channels, only times Buffer can still fetch the video at
calls = buffer.calls
cannot(lambda: publish(1, ["channel-tiktok"]), "Approve this clip")
jobs.update_clip(ME, pid, 1, jobs.ClipEdit(review="approved"))
jobs.update_clip(ME, pid, 2, jobs.ClipEdit(review="approved"))
assert publish(99, ["channel-tiktok"]) is None
cannot(lambda: publish(1, ["channel-tiktok"], now - timedelta(minutes=5)), "already passed", 422)
cannot(lambda: publish(1, ["channel-tiktok"], now + timedelta(days=30, hours=1)), "up to 30 days ahead", 422)
public_url = os.environ.pop("S3_PUBLIC_URL")
cannot(lambda: publish(1, ["channel-tiktok"]), "needs a public bucket")
os.environ["S3_PUBLIC_URL"] = public_url
assert buffer.calls == calls, "refusals that don't need Buffer mustn't use its request limit"
cannot(lambda: publish(1, ["channel-linkedin"]), "can't be used", 422)
cannot(lambda: publish(1, ["channel-instagram-personal"]), "can't be used", 422)
cannot(lambda: publish(1, ["no-such-channel"]), "can't be used", 422)

# post now to three networks: each gets its own copy and the input its network requires
sent = publish(1, ["channel-tiktok", "channel-youtube", "channel-instagram"])
assert [p["status"] for p in sent] == ["sending"] * 3 and all(p["buffer_post_id"] for p in sent), sent
inputs = {buffer.inputs[p["buffer_post_id"]]["channelId"]: buffer.inputs[p["buffer_post_id"]] for p in sent}
tiktok, youtube, instagram = inputs["channel-tiktok"], inputs["channel-youtube"], inputs["channel-instagram"]
assert tiktok["text"] == "tiktok post" and tiktok["mode"] == "shareNow" and youtube["text"] == "youtube post"
assert tiktok["assets"][0]["video"]["metadata"] == {"thumbnailOffset": 1000} and "metadata" not in youtube["assets"][0]["video"]
assert len(youtube["metadata"]["youtube"]["title"]) == 100 and youtube["metadata"]["youtube"]["categoryId"] == "22"
assert instagram["metadata"]["instagram"]["type"] == "reel"
assert tiktok["assets"][0]["video"]["url"] == f"{public_url}/{sent[0]['id']}.mp4", "a plain public link, not signed"
assert all(public_copy(p) == b"clip 1" for p in sent), "each post has its own public copy of the clip"
cannot(lambda: publish(1, ["channel-tiktok"]), "already scheduled or posted on Clipperdemo")
os.environ["BUFFER_OWNERS"] = f"{ME},{OTHER}"  # even an account allowed to publish can't see or remove my posts
assert publishing.publications(OTHER, pid) is None and publishing.remove(OTHER, sent[0]["id"]) is None
assert rows()[(1, "tiktok")]["id"] == sent[0]["id"]
os.environ["BUFFER_OWNERS"] = ME

# scheduled post: Buffer gets the time; nothing is asked about it before then
due = now + timedelta(days=2)
scheduled = publish(2, ["channel-twitter"], due)[0]
assert scheduled["status"] == "scheduled" and scheduled["due_at"] == due
assert buffer.inputs[scheduled["buffer_post_id"]] | {"assets": None} == {
    "channelId": "channel-twitter", "text": "x post", "assets": None, "schedulingType": "automatic",
    "needsApproval": False, "mode": "customScheduled", "dueAt": due.isoformat()}

# status: re-checked with Buffer only once a post's time has come, and at most once a minute
calls = buffer.calls
assert rows()[(1, "tiktok")]["status"] == "sending" and buffer.calls == calls, "checked less than a minute ago"
with db.connect() as c:
    c.execute("update publications set checked_at = now() - interval '2 minutes'")
buffer.posts[sent[2]["buffer_post_id"]]["status"] = "error"  # Instagram fails when Buffer sends it
buffer.posts[sent[2]["buffer_post_id"]]["error"] = {"message": "Instagram rejected the video"}
now_rows = rows()
assert now_rows[(1, "tiktok")]["status"] == "sent" and now_rows[(1, "tiktok")]["external_link"]
assert now_rows[(1, "instagram")]["status"] == "error" and now_rows[(1, "instagram")]["error"] == "Instagram rejected the video"
assert now_rows[(2, "twitter")]["status"] == "scheduled" and buffer.calls == calls + 3, "the future post wasn't asked about"
assert public_copy(now_rows[(1, "tiktok")]) is None and public_copy(now_rows[(1, "instagram")]) is None
assert public_copy(now_rows[(2, "twitter")]) == b"clip 2", "copies go once a post is sent or failed, not before"
assert publishing.publications(ME, uuid4()) is None
assert publishing.publications(ME, pid)["schedule_until"] <= datetime.now(timezone.utc) + publishing.AHEAD

# a failed post doesn't block trying again; Buffer refusing a post is recorded with its reason
buffer.fail = "You've reached the limit of scheduled posts for this channel"
refused = publish(1, ["channel-instagram"])[0]
assert refused["status"] == "error" and "limit of scheduled posts" in refused["error"] and public_copy(refused) is None
buffer.fail = None
assert publish(1, ["channel-instagram"])[0]["status"] == "sending"

# Buffer reads the video again when it sends: a copy that's gone by then makes the post fail
early = publish(2, ["channel-youtube"])[0]
storage.delete_public(f"{early['id']}.mp4")
with db.connect() as c:
    c.execute("update publications set checked_at = now() - interval '2 minutes' where id = %s", (early["id"],))
assert rows()[(2, "youtube")]["error"] == "Video could not be read from its URL."
publishing.remove(ME, early["id"])

# rate limit, a key revoked later ("expired token"), Buffer down, Buffer unreachable: readable, nothing half-done
buffer.fail = "rate_limited"
cannot(lambda: publish(2, ["channel-tiktok"]), "Try again in 13 minutes", 502)
assert (2, "tiktok") not in rows(), "refused at the channel lookup: nothing sent, nothing recorded"
listed, publishing.channels = publishing.channels, lambda owner: listed_channels  # limit hit between lookup and posting
buffer.fail = None
listed_channels = listed(ME)
buffer.fail = "rate_limited"
cannot(lambda: publish(2, ["channel-tiktok", "channel-youtube"]), "Try again in 13 minutes", 502)
publishing.channels = listed
with db.connect() as c:
    c.execute("update publications set checked_at = now() - interval '2 minutes'")
now_rows = rows()  # status checks hit the limit too, and the page still loads with what's known
assert now_rows[(2, "tiktok")]["status"] == "error" and "request limit" in now_rows[(2, "tiktok")]["error"]
assert public_copy(now_rows[(2, "tiktok")]) is None
assert (2, "youtube") not in now_rows, "stops at the first channel: the rest would hit the same limit"
buffer.fail = "unauthorized"
cannot(lambda: publishing.channels(ME), "create a new one in Buffer", 502)
buffer.fail = "down"
cannot(lambda: publishing.channels(ME), "Buffer had a problem (503)", 502)
buffer.fail = None
publishing.API = "http://127.0.0.1:9"
cannot(lambda: publishing.channels(ME), "Couldn't reach Buffer", 502)
publishing.API = buffer.url

# unschedule, clear failures, refuse posts that went out; posts deleted inside Buffer disappear here too;
# a project can't be deleted while a post still has to fetch its video
assert jobs.delete_project(ME, pid) is None
cannot(lambda: publishing.remove(ME, rows()[(1, "tiktok")]["id"]), "already gone out")
assert publishing.remove(ME, scheduled["id"])["id"] == scheduled["id"] and scheduled["buffer_post_id"] not in buffer.posts
assert public_copy(scheduled) is None, "unscheduling removes the public copy"
for row in publishing.publications(ME, pid)["publications"]:
    if row["status"] == "error":
        assert publishing.remove(ME, row["id"])
assert publishing.remove(ME, scheduled["id"]) is None
later = publish(2, ["channel-twitter"], now + timedelta(days=1))[0]
del buffer.posts[later["buffer_post_id"]]
with db.connect() as c:
    c.execute("update publications set due_at = now() - interval '1 hour', checked_at = now() - interval '2 minutes'"
              " where id = %s", (later["id"],))
assert (2, "twitter") not in rows() and public_copy(later) is None
assert {s for _, s in rows()} == {"tiktok", "youtube", "instagram"} and all(r["status"] == "sent" for r in rows().values())
assert storage.client().list_objects_v2(Bucket="clips-public").get("KeyCount") == 0, "no public copies left behind"

# expired clips can't be published
with db.connect() as c:
    c.execute("update projects set finished_at = now() - interval '31 days' where id = %s", (pid,))
cannot(lambda: publish(2, ["channel-youtube"]), "expired")
assert jobs.delete_project(ME, pid)["id"] == pid, "only sent posts left"
with db.connect() as c:
    assert c.execute("select count(*) from publications").fetchone()["count"] == 0

# per-user Buffer OAuth: a user connects their own account and posts through it without BUFFER_OWNERS
import oauth  # noqa: E402
import urllib.parse  # noqa: E402

os.environ |= {"BUFFER_CLIENT_ID": "client-123", "BUFFER_CLIENT_SECRET": fake_buffer.KEY,
               "BUFFER_REDIRECT_URL": "http://localhost:3000/oauth/return"}
oauth.AUTH = buffer.auth_url

started = oauth.connect_url(OTHER)
assert "code_challenge=" in started and "state=" in started, "PKCE is on"
state = urllib.parse.parse_qs(urllib.parse.urlparse(started).query)["state"][0]
assert oauth.state_owner(state) == OTHER and oauth.state_owner(state + "x") is None
assert oauth.state_owner(state) != ME, "the route refuses a connect attempt started by another account"
# a fresh connect: the fake's token exchange needs no real browser, only the handshake to line up
account = oauth.callback(state, "code-2")
assert account["provider"] == "buffer"
assert oauth.state_owner(state) is None and oauth.state_owner(f"{state}x") is None, "a state is single use"
theirs = oauth.token_for(OTHER)
assert theirs in buffer.access_tokens and theirs != os.environ.get("BUFFER_API_KEY")
# their channels come from their own account, with no workspace key at all and BUFFER_OWNERS not listing them
os.environ.pop("BUFFER_API_KEY", None)
assert [c["id"] for c in publishing.channels(OTHER)] == [c["id"] for c in buffer.channels]
with db.connect() as c:  # an expiring token is refreshed, and the single-use refresh token rotated
    c.execute("update connected_accounts set expires_at = now() + interval '1 minute'")
first = theirs
assert oauth.token_for(OTHER) not in (first,), "refresh didn't rotate the access token"
refreshed = oauth.token_for(OTHER)
# a replayed refresh token (Buffer's rule) breaks the connection: the row goes, reconnecting is the only way
stale = refreshed
with db.connect() as c:
    c.execute("update connected_accounts set expires_at = now() + interval '1 minute'")
saved_request = oauth._token_request
def replay(form):
    return saved_request({**form, "refresh_token": "rt-1"})  # already used above
oauth._token_request = replay
try:
    oauth.token_for(OTHER)
    raise AssertionError("accepted a replayed refresh token")
except oauth.ConnectError as e:
    assert "Connect it again" in str(e) and e.status == 401
oauth._token_request = saved_request
assert oauth.connection(OTHER) is None, "a broken connection is removed, not kept"
# disconnecting a live connection clears it for that owner only
assert oauth.callback(*(lambda s: (s, "code-3"))(urllib.parse.parse_qs(
    urllib.parse.urlparse(oauth.connect_url(OTHER)).query)["state"][0]))["provider"] == "buffer"
oauth.disconnect(OTHER)
assert oauth.connection(OTHER) is None and oauth.token_for(OTHER) is None
# a public client (what we registered: PKCE, no secret) connects the same way without BUFFER_CLIENT_SECRET
os.environ.pop("BUFFER_CLIENT_SECRET", None)
state = urllib.parse.parse_qs(urllib.parse.urlparse(oauth.connect_url(OTHER)).query)["state"][0]
account = oauth.callback(state, "code-4")
assert oauth.token_for(OTHER) in buffer.access_tokens, "public-client connect (no secret) works"
oauth.disconnect(OTHER)
os.environ["BUFFER_CLIENT_SECRET"] = fake_payments.KEY  # a wrong secret must fail, not fall back to public mode
state = urllib.parse.parse_qs(urllib.parse.urlparse(oauth.connect_url(OTHER)).query)["state"][0]
try:
    oauth.callback(state, "code-5")
    raise AssertionError("a wrong client secret was accepted")
except oauth.ConnectError:
    pass
del os.environ["BUFFER_CLIENT_SECRET"]  # production runs secret-less (public client)
os.environ["BUFFER_API_KEY"] = fake_buffer.KEY

# content calendar: approved clips spread over posting days and times, queued, then handed to Buffer by the worker
from datetime import date, time  # noqa: E402

with db.connect() as c:
    pid = c.execute("insert into projects (owner, source, options, status, finished_at) values"
                    " (%s, 'https://example.com/v', '{}', 'completed', now()) returning id", (ME,)).fetchone()["id"]
    for i in (1, 2, 3, 4):
        c.execute("""insert into clips (project_id, idx, start_s, end_s, score, reason, hook, title, description,
                                        hashtags, posts) values (%s, %s, 0, 30, 90, 'r', 'h', %s, 'd', '[]', %s)""",
                  (pid, i, f"Clip {i}", Jsonb({k: f"{k} post {i}" for k in clipper.Posts.model_fields})))
        for ext in ("mp4", "ass", "jpg"):
            storage.client().put_object(Bucket="clips", Key=f"projects/{pid}/clip{i:02}.{ext}", Body=f"clip {i}".encode())
tokyo = timezone(timedelta(hours=9))  # no daylight saving, so the expected times below are plain arithmetic


def calendar(**changes):
    return publishing.Calendar(**{"channels": ["channel-tiktok", "channel-youtube"], "days": [1, 3, 5],
                                  "times": ["18:30", "09:00"], "start": date.today(), "timezone": "Asia/Tokyo"} | changes)


def post_row(publication):
    with db.connect() as c:
        return c.execute("select * from publications where id = %s", (publication["id"],)).fetchone()


for bad in ({"timezone": "Mars/Olympus"}, {"timezone": "../../etc/passwd"}, {"days": [0]}, {"days": []},
            {"times": []}, {"channels": []}, {"times": ["25:00"]}):
    rejects(lambda: calendar(**bad), f"accepted calendar {bad}")
assert publishing.plan(ME, uuid4(), calendar()) is None and publishing.schedule(ME, uuid4(), calendar()) is None
assert publishing.plan(OTHER, pid, calendar()) is None and publishing.schedule(OTHER, pid, calendar()) is None
cannot(lambda: publishing.plan(ME, pid, calendar()), "Approve the clips you want to schedule first")
for i in (1, 2, 3):
    jobs.update_clip(ME, pid, i, jobs.ClipEdit(review="approved"))

# the plan: clips in order, one per posting time, the earliest times first (checked against every half hour)
planned = publishing.plan(ME, pid, calendar())
earliest = datetime.now(timezone.utc) + publishing.EARLIEST
half_hours = (earliest.replace(minute=0, second=0, microsecond=0) + timedelta(minutes=30 * k) for k in range(1, 1500))
expected = [t for t in half_hours if t >= earliest and t.astimezone(tokyo).isoweekday() in (1, 3, 5)
            and t.astimezone(tokyo).time() in (time(9), time(18, 30))][:4]
assert [(p["clip_idx"], p["due_at"]) for p in planned["posts"]] == list(zip([1, 2, 3], expected)), planned
assert planned["left"] == [] and planned["posts"][0]["title"] == "Clip 1"
later_start = date.today() + timedelta(days=10)
assert all(p["due_at"].astimezone(tokyo).date() >= later_start
           for p in publishing.plan(ME, pid, calendar(start=later_start))["posts"])
edge = (datetime.now(timezone.utc) + timedelta(days=29)).date()  # 12:00 UTC on this day fits; the next day's may not
late = publishing.plan(ME, pid, calendar(start=edge, days=list(range(1, 8)), times=["12:00"], timezone="UTC"))
assert 1 <= len(late["posts"]) <= 2 and [p["clip_idx"] for p in late["posts"]] + late["left"] == [1, 2, 3], late
assert all(p["due_at"] <= datetime.now(timezone.utc) + publishing.AHEAD for p in late["posts"])
cannot(lambda: publishing.plan(ME, pid, calendar(start=date.today() + timedelta(days=31))), "within the next 30 days", 422)

# scheduling queues a post per clip and channel without asking Buffer anything but the channel list
cannot(lambda: publishing.schedule(ME, pid, calendar(channels=["channel-tiktok", "channel-linkedin"])), "can't be used", 422)
calls = buffer.calls
queued = publishing.schedule(ME, pid, calendar())
assert buffer.calls == calls + 2, "organizations + channels only"
assert sorted((p["clip_idx"], p["service"], p["status"], p["due_at"]) for p in queued) == sorted(
    (p["clip_idx"], s, "queued", p["due_at"]) for p in planned["posts"] for s in ("tiktok", "youtube")), queued
assert not any(p["buffer_post_id"] for p in queued)
cannot(lambda: publishing.schedule(ME, pid, calendar()), "Every approved clip is already scheduled or posted")
cannot(lambda: publishing.publish(ME, pid, 1, publishing.Publish(channels=["channel-tiktok"])), "already scheduled")
with db.connect() as c:
    c.execute("update publications set checked_at = now() - interval '2 minutes'")
calls = buffer.calls
assert len(publishing.publications(ME, pid)["publications"]) == 6 and buffer.calls == calls, "queued posts aren't in Buffer"
assert jobs.delete_project(ME, pid) is None, "queued posts still have to go out"
unqueued = next(p for p in queued if p["clip_idx"] == 3 and p["service"] == "youtube")
assert publishing.remove(ME, unqueued["id"])["id"] == unqueued["id"] and buffer.calls == calls and post_row(unqueued) is None

# the worker: Buffer's limit puts the post back in the queue; then each queued post is created with its time
buffer.fail = "rate_limited"
cannot(publishing.send_queued, "Try again in 13 minutes", 502)
with db.connect() as c:
    assert c.execute("select count(*) from publications where status = 'queued'").fetchone()["count"] == 5
buffer.fail = None
while publishing.send_queued():
    pass
assert publishing.send_queued() is False
for p in queued:
    if p["id"] == unqueued["id"]:
        continue
    row = post_row(p)
    sent_input = buffer.inputs[row["buffer_post_id"]]
    assert row["status"] == "scheduled" and row["due_at"] == p["due_at"], row
    assert sent_input["mode"] == "customScheduled" and sent_input["dueAt"] == p["due_at"].isoformat()
    assert sent_input["text"] == f"{row['service']} post {row['clip_idx']}" and public_copy(row) == f"clip {row['clip_idx']}".encode()

# the worker: Buffer refusing, Buffer never answering (the post may exist: not sent again), a time already gone;
# a clip approved later goes after the posts TikTok already has, not on top of them (on X it could take the first time)
jobs.update_clip(ME, pid, 4, jobs.ClipEdit(review="approved"))
assert publishing.plan(ME, pid, calendar(channels=["channel-twitter"]))["posts"][0]["due_at"] == expected[0]


def queue_clip4():
    return publishing.schedule(ME, pid, calendar(channels=["channel-tiktok"]))[0]


buffer.fail = "You've reached the limit of scheduled posts for this channel"
refused = queue_clip4()
assert refused["due_at"] == expected[3], (refused["due_at"], expected)
assert publishing.send_queued() and "limit of scheduled posts" in post_row(refused)["error"] and public_copy(refused) is None
buffer.fail = None
silent = queue_clip4()
real_call = publishing.call


def no_answer(*args, **kwargs):
    raise publishing.PublishError("Couldn't reach Buffer. Try again in a minute.", 502) from TimeoutError()


publishing.call = no_answer
assert publishing.send_queued() and "didn't answer in time" in post_row(silent)["error"] and public_copy(silent) is None
publishing.call = real_call
missed = queue_clip4()
with db.connect() as c:
    c.execute("update publications set due_at = now() + interval '30 seconds' where id = %s", (missed["id"],))
calls = buffer.calls
assert publishing.send_queued() and post_row(missed)["status"] == "error" and buffer.calls == calls
assert "before its time" in post_row(missed)["error"]
assert publishing.send_queued() is False

# the content package carries the calendar: every post, in time order
package = zipfile.ZipFile(io.BytesIO(b"".join(jobs.content_package(ME, pid))))
table = list(csv.DictReader(io.StringIO(package.read("calendar.csv").decode("utf-8-sig"))))
assert list(table[0]) == ["due_at", "clip_idx", "title", "network", "channel_name", "status", "external_link", "error"]
assert len(table) == 8 and {r["network"] for r in table} == {"tiktok", "youtube"}, table
scheduled_rows = [r for r in table if r["status"] == "scheduled"]
assert [r["due_at"] for r in scheduled_rows] == sorted(r["due_at"] for r in scheduled_rows) and scheduled_rows[0]["title"] == "Clip 1"

# expired videos can't be scheduled; unscheduling everything leaves no public copies; then the project can go
with db.connect() as c:
    c.execute("update projects set finished_at = now() - interval '31 days' where id = %s", (pid,))
cannot(lambda: publishing.plan(ME, pid, calendar()), "expired")
in_buffer = {row["buffer_post_id"] for row in publishing.publications(ME, pid)["publications"]} - {None}
for row in publishing.publications(ME, pid)["publications"]:
    publishing.remove(ME, row["id"])
assert len(in_buffer) == 5 and not in_buffer & buffer.posts.keys()
assert storage.client().list_objects_v2(Bucket="clips-public").get("KeyCount") == 0
assert jobs.delete_project(ME, pid)["id"] == pid

# progress bar and thumbnail on every project
assert jobs.percent("queued", "") == 0 and jobs.percent("completed", "") == 100
assert jobs.percent("downloading", "50%") == 14 and jobs.percent("rendering", "clip 1 of 5") == 60
assert jobs.percent("rendering", "clip 5 of 5") == 88 and jobs.percent("failed", "no speech") is None
steps = [jobs.percent(*s) for s in [("queued", ""), ("downloading", "0%"), ("downloading", "100%"), ("transcribing", ""),
                                    ("analyzing", ""), ("rendering", "clip 2 of 3"), ("packaging", "3 clips"), ("completed", "")]]
assert steps == sorted(steps), steps  # never goes backwards
for link in ("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://youtu.be/dQw4w9WgXcQ?t=3",
             "https://youtube.com/shorts/dQw4w9WgXcQ", "https://www.youtube.com/watch?feature=share&v=dQw4w9WgXcQ"):
    assert jobs.thumbnail(link) == "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg", link
assert jobs.thumbnail("upload:abc") is None and jobs.thumbnail("https://vimeo.com/123") is None
shown = jobs.present({"status": "rendering", "detail": "clip 2 of 4", "error": None, "source": "https://youtu.be/dQw4w9WgXcQ"})
assert shown["progress"] == 69 and shown["thumbnail"].endswith("/dQw4w9WgXcQ/hqdefault.jpg")

# sign-in: website tokens must name one of our sites, the mobile app's native tokens name none
import api  # noqa: E402
from types import SimpleNamespace  # noqa: E402
from fastapi import HTTPException  # noqa: E402

os.environ.setdefault("CLERK_SECRET_KEY", "sk_test_unused")


def owner_for(signed_in, payload):
    api.authenticate_request = lambda *_: SimpleNamespace(is_signed_in=signed_in, payload=payload)
    try:
        return api.signed_in(None)
    except HTTPException as e:
        return e.status_code


assert owner_for(True, {"sub": "user_a", "azp": "http://localhost:3000"}) == "user_a"
assert owner_for(True, {"sub": "user_a", "org_id": "org_b"}) == "org_b"  # the app: no azp
assert owner_for(True, {"sub": "user_a", "azp": "https://evil.example"}) == 401
assert owner_for(False, {}) == 401

# the free downloader takes links from the sites on its allowlist, and nothing else: it is public and
# unauthenticated, so anything wider makes it an open proxy for our bandwidth and our IP
for good in ["https://www.youtube.com/watch?v=x", "https://youtu.be/x", "https://www.tiktok.com/@a/video/1",
             "https://vimeo.com/76979871", "http://x.com/a/status/1", "https://m.facebook.com/watch?v=1"]:
    assert api.supported(good), good
for bad in ["https://evil.example/video.mp4", "http://169.254.169.254/latest/meta-data", "file:///etc/passwd",
            "https://youtube.com.evil.example/x", "https://notyoutube.com/x", "javascript:alert(1)", "youtu.be/x"]:
    assert not api.supported(bad), bad

# rate limiting: a key gets its cap per window, other keys are unaffected
assert not any(api.limited("spam", 2) for _ in range(2)), "blocked before the cap"
assert api.limited("spam", 2), "didn't block at the cap"
assert not api.limited("someone-else", 2), "another key shares the bucket"

# with Redis down (production counts there when REDIS_URL is set), the in-memory bucket takes over
saved, api._redis = api._redis, __import__("redis").Redis.from_url("redis://127.0.0.1:9/", socket_timeout=0.3)
assert not any(api.limited("fallback", 2) for _ in range(2)) and api.limited("fallback", 2)
api._redis = saved

s3.stop()
print("ok")
