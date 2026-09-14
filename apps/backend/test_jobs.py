"""Job queue, storage and billing checks against a throwaway Postgres (pgserver) and a local S3 (moto).
Needs network for DNS. Run: python test_jobs.py"""
import csv
import io
import json
import os
import socket
import tempfile
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
               "S3_ACCESS_KEY_ID": "test", "S3_SECRET_ACCESS_KEY": "test"}

import billing  # noqa: E402  (after the env points at the test services)
import clipper  # noqa: E402
import db  # noqa: E402
import jobs  # noqa: E402
import storage  # noqa: E402
from jobs import NewProject, NewUpload  # noqa: E402


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
boto3.client("s3", endpoint_url=os.environ["S3_ENDPOINT"], region_name="us-east-1", aws_access_key_id="test",
             aws_secret_access_key="test").create_bucket(Bucket="clips")
storage.setup()
rules = storage.client().get_bucket_lifecycle_configuration(Bucket="clips")["Rules"]
assert {r["ID"]: r["Expiration"]["Days"] for r in rules} == {"uploads": 1, "projects": 30}

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
refuses(lambda: jobs.create_project(NewProject(source="https://example.com/video")), "started without a plan",
        "Choose a plan")
rejects(lambda: billing.Subscribe(plan="free"), "accepted an unknown plan")
creator = billing.subscribe("creator")
assert creator["status"] == "active" and creator["price_cents"] == 1500 and creator["charged_cents"] == 0
assert billing.subscribe("creator")["id"] == creator["id"], "choosing the current plan changes nothing"
business = billing.subscribe("business")
assert billing.current()["id"] == business["id"]
assert [s["plan"] for s in billing.summary()["history"]] == ["business", "creator"]
try:
    with db.connect() as c:
        c.execute("insert into subscriptions (plan, price_cents) values ('pro', 3900)")
    raise AssertionError("allowed two active plans")
except psycopg.errors.UniqueViolation:
    pass


def upload(data=b"fake video"):
    ticket = jobs.create_upload(NewUpload(content_type="video/mp4", size=len(data)))
    rejects(lambda: NewProject(source=ticket["source"]), "accepted an upload that was never PUT")
    http("PUT", ticket["upload_url"], data, ticket["headers"])
    return ticket["source"]


seen, limits = [], []


def fake_run(behaviour):
    """Stands in for the real pipeline: writes scratch + output files and reports progress like clipper.run."""
    def run(source, out, n, min_len, max_len, progress, load_transcript, save_transcript, work_root, max_seconds,
            max_clips):
        seen.append(Path(source).read_bytes() if Path(source).is_file() else source)
        limits.append((max_seconds, max_clips))
        work_root.mkdir(parents=True, exist_ok=True)
        (work_root / "source.mp4").write_bytes(b"downloaded")
        progress("transcribing")
        if behaviour == "crash":
            raise ConnectionError("network down")
        if behaviour == "permanent":
            raise clipper.PermanentError("no speech found")
        if behaviour == "cancel":
            jobs.cancel_project(current["id"])
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
    return jobs.get_project(project["id"])


def upload_exists(source):
    return storage.size(f"uploads/{source.removeprefix('upload:')}") is not None


# uploaded source, success: worker fetches the upload, clips land in storage behind signed links, local + source cleaned
source = upload()
p = jobs.create_project(NewProject(source=source, clips=3))
assert p["status"] == "queued" and p["message"] == "Waiting to start..."
clipper.run = fake_run("ok")
current = jobs.claim()
assert current["id"] == p["id"] and current["status"] == "downloading" and current["attempts"] == 1
assert jobs.claim() is None, "the same project must not be claimed twice"
jobs.run_job(current)
done = status(p)
assert done["status"] == "completed" and done["message"] == "Ready." and done["source_key"] == "Youtube-x"
assert seen[-1] == b"fake video", "the worker must process the uploaded bytes"
assert limits[-1] == (3000 * 60, 500), "the worker passes the plan's remaining minutes and clips to the engine"
clip = done["clips"][0]
assert clip["posts"]["x"] == "post" and http("GET", clip["video_url"]) == b"clip mp4"
assert http("GET", clip["captions_url"]) == b"clip ass" and http("GET", clip["thumbnail_url"]) == b"clip jpg"
assert storage.size(f"projects/{p['id']}/clips.json") is not None
assert not (jobs.TMP / str(p["id"])).exists(), "local scratch must be deleted"
assert not upload_exists(source), "the uploaded source video must be deleted after processing"
assert (done["files_expire_at"] - done["finished_at"]).days == storage.CLIP_DAYS
with urllib.request.urlopen(clip["video_url"]) as response:  # links save as files; <video> ignores the header
    assert response.headers["Content-Disposition"] == 'attachment; filename="clip01.mp4"'

# review: approve + edit copy, omitted fields untouched, empty hashtags allowed, bad values rejected, missing clip None
assert clip["review"] == "pending"
posts = clip["posts"] | {"x": "edited post"}
edited = jobs.update_clip(p["id"], 1, jobs.ClipEdit(review="approved", title="Better title", posts=posts, hashtags=[]))
assert edited["review"] == "approved" and edited["title"] == "Better title" and edited["hashtags"] == []
assert edited["posts"]["x"] == "edited post" and edited["description"] == "d" and edited["hook"] == "h"
assert jobs.update_clip(p["id"], 1, jobs.ClipEdit(review="rejected"))["title"] == "Better title"
assert status(p)["clips"][0]["review"] == "rejected"
assert jobs.update_clip(p["id"], 99, jobs.ClipEdit(review="approved")) is None
rejects(lambda: jobs.ClipEdit(review="maybe"), "accepted an unknown review state")
rejects(lambda: jobs.ClipEdit(title=""), "accepted an empty title")
rejects(lambda: jobs.ClipEdit(posts={"x": "only one platform"}), "accepted incomplete posts")
first = p
assert [x["clip_count"] for x in jobs.list_projects() if x["id"] == p["id"]] == [1]

# content package: rejected clips stay out (nothing left -> None); the ZIP carries the files and the edited copy
assert jobs.content_package(p["id"]) is None and jobs.content_package(uuid4()) is None
jobs.update_clip(p["id"], 1, jobs.ClipEdit(review="approved"))
package = zipfile.ZipFile(io.BytesIO(b"".join(jobs.content_package(p["id"]))))
assert sorted(package.namelist()) == ["captions/clip01.ass", "metadata/clips.csv", "metadata/clips.json",
                                      "thumbnails/clip01.jpg", "videos/clip01.mp4"], package.namelist()
assert package.read("videos/clip01.mp4") == b"clip mp4" and package.read("thumbnails/clip01.jpg") == b"clip jpg"
metadata = json.loads(package.read("metadata/clips.json"))
assert metadata[0]["title"] == "Better title" and metadata[0]["posts"]["x"] == "edited post"
row = next(csv.DictReader(io.StringIO(package.read("metadata/clips.csv").decode("utf-8-sig"))))
assert row["x"] == "edited post" and row["review"] == "approved" and row["hook"] == "h"

# expired files: no links handed out, nothing to package
with db.connect() as c:
    c.execute("update projects set finished_at = now() - interval '31 days' where id = %s", (p["id"],))
assert "video_url" not in status(p)["clips"][0] and jobs.content_package(p["id"]) is None

# transient failure: requeued with backoff, upload kept for the retry; failed + upload deleted once attempts run out
source = upload()
p = jobs.create_project(NewProject(source=source))
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
p = jobs.create_project(NewProject(source="https://example.com/video"))
clipper.run = fake_run("permanent")
jobs.run_job(jobs.claim())
assert status(p)["status"] == "failed" and status(p)["attempts"] == 1
assert status(p)["detail"] == "no speech found", "a permanent error's message is the reason people see"

# cancel: queued cancels at once (and drops its upload); running stops at the next step; finished can't be cancelled
source = upload()
p = jobs.create_project(NewProject(source=source))
assert jobs.cancel_project(p["id"])["status"] == "cancelled" and jobs.claim() is None and not upload_exists(source)
assert jobs.cancel_project(p["id"]) is None
p = jobs.create_project(NewProject(source="https://example.com/video"))
clipper.run = fake_run("cancel")
current = jobs.claim()
jobs.run_job(current)
assert status(p)["status"] == "cancelled"

# crashed worker: no heartbeat for 2+ minutes -> the next claim requeues and retakes it
p = jobs.create_project(NewProject(source="https://example.com/video"))
jobs.claim()
with db.connect() as c:
    c.execute("update projects set heartbeat_at = now() - interval '5 minutes' where id = %s", (p["id"],))
again = jobs.claim()
assert again["id"] == p["id"] and again["attempts"] == 2

# delete: running projects refuse (cancel first); finished ones go with their clips and stored files
assert jobs.delete_project(again["id"]) is None and status(again)
assert jobs.delete_project(first["id"])["id"] == first["id"]
assert status(first) is None and storage.size(f"projects/{first['id']}/clip01.mp4") is None
with db.connect() as c:
    assert c.execute("select count(*) from clips where project_id = %s", (first["id"],)).fetchone()["count"] == 0
assert jobs.delete_project(first["id"]) is None
source = upload()
p = jobs.create_project(NewProject(source=source))
assert jobs.delete_project(p["id"]) and not upload_exists(source), "deleting a queued project drops its upload"

# transcript cache round-trip
jobs.save_transcript("Youtube-x", {"language": "en", "segments": [], "words": []})
jobs.save_transcript("Youtube-x", {"language": "de", "segments": [], "words": []})  # first write wins
assert jobs.load_transcript("Youtube-x")["language"] == "en" and jobs.load_transcript("nope") is None

# usage this month: failed/cancelled projects don't use a video, minutes come from completed projects' transcripts,
# last month doesn't count
with db.connect() as c:
    c.execute("delete from projects")
jobs.save_transcript("Youtube-2h", {"language": "en", "words": [], "segments": [{"start": 0, "end": 7200, "text": "x"}]})


def add_project(status_, created="now()"):
    with db.connect() as c:
        return c.execute(f"insert into projects (source, options, status, source_key, created_at) values"
                         f" ('https://example.com/v', '{{}}', %s, 'Youtube-2h', {created}) returning id",
                         (status_,)).fetchone()["id"]


for status_ in ("completed", "failed", "cancelled", "queued"):
    add_project(status_)
add_project("completed", "now() - interval '40 days'")
assert billing.usage() == {"videos": 2, "minutes": 120, "clips": 0}, billing.usage()

# limits: Creator = 5 videos, 5 hours, 50 clips
billing.subscribe("creator")
assert billing.allowance() == {"videos": 3, "seconds": 3 * 3600, "clips": 50}
for _ in range(3):
    queued = add_project("queued")
refuses(lambda: jobs.create_project(NewProject(source="https://example.com/video")), "started a 6th video",
        "all 5 videos")
assert billing.allowance()["videos"] == 0, "projects already queued still get processed"
add_project("completed")
add_project("completed")  # 6 hours of video now
refuses(billing.allowance, "processed past the hours", "hours of video")
with db.connect() as c:  # the worker refuses too, and says why
    c.execute("update projects set status = 'cancelled' where status = 'queued' and id <> %s", (queued,))
jobs.run_job(jobs.claim())
assert status({"id": queued})["status"] == "failed" and "5 hours of video" in status({"id": queued})["detail"]
billing.subscribe("pro")  # 15 hours, 150 clips
with db.connect() as c:
    c.execute("""insert into clips (project_id, idx, start_s, end_s, score, reason, hook, title, description, hashtags,
                                    posts)
                 select %s, i, 0, 1, 1, '', '', 't', '', '[]', '{}' from generate_series(1, 150) i""", (queued,))
refuses(billing.allowance, "made clips past the plan", "all 150 clips")
assert billing.cancel()["status"] == "ended" and billing.current() is None and billing.cancel() is None
refuses(billing.allowance, "processed without a plan", "Choose a plan")

s3.stop()
print("ok")
