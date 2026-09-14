"""Job queue + storage checks against a throwaway Postgres (pgserver) and a local S3 (moto). Needs network for DNS.
Run: python test_jobs.py"""
import os
import socket
import tempfile
import urllib.request
from pathlib import Path

import pgserver
from moto.server import ThreadedMotoServer

database = pgserver.get_server(tempfile.mkdtemp(), cleanup_mode="delete")
with socket.socket() as s:
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
s3 = ThreadedMotoServer(ip_address="127.0.0.1", port=port, verbose=False)
s3.start()
os.environ |= {"DATABASE_URL": database.get_uri(), "S3_ENDPOINT": f"http://127.0.0.1:{port}", "S3_BUCKET": "clips",
               "S3_ACCESS_KEY_ID": "test", "S3_SECRET_ACCESS_KEY": "test"}

import clipper  # noqa: E402  (after the env points at the test services)
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


def upload(data=b"fake video"):
    ticket = jobs.create_upload(NewUpload(content_type="video/mp4", size=len(data)))
    rejects(lambda: NewProject(source=ticket["source"]), "accepted an upload that was never PUT")
    http("PUT", ticket["upload_url"], data, ticket["headers"])
    return ticket["source"]


seen = []


def fake_run(behaviour):
    """Stands in for the real pipeline: writes scratch + output files and reports progress like clipper.run."""
    def run(source, out, n, min_len, max_len, progress, load_transcript, save_transcript, work_root):
        seen.append(Path(source).read_bytes() if Path(source).is_file() else source)
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
clip = done["clips"][0]
assert clip["posts"]["x"] == "post" and http("GET", clip["video_url"]) == b"clip mp4"
assert http("GET", clip["captions_url"]) == b"clip ass" and http("GET", clip["thumbnail_url"]) == b"clip jpg"
assert storage.size(f"projects/{p['id']}/clips.json") is not None
assert not (jobs.TMP / str(p["id"])).exists(), "local scratch must be deleted"
assert not upload_exists(source), "the uploaded source video must be deleted after processing"
assert (done["files_expire_at"] - done["finished_at"]).days == storage.CLIP_DAYS

# expired files: no links handed out
with db.connect() as c:
    c.execute("update projects set finished_at = now() - interval '31 days' where id = %s", (p["id"],))
assert "video_url" not in status(p)["clips"][0]

# transient failure: requeued with backoff, upload kept for the retry; failed + upload deleted once attempts run out
source = upload()
p = jobs.create_project(NewProject(source=source))
clipper.run = fake_run("crash")
jobs.run_job(jobs.claim())
retrying = status(p)
assert retrying["status"] == "queued" and "network down" in retrying["error"]
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

# transcript cache round-trip
jobs.save_transcript("Youtube-x", {"language": "en", "segments": [], "words": []})
jobs.save_transcript("Youtube-x", {"language": "de", "segments": [], "words": []})  # first write wins
assert jobs.load_transcript("Youtube-x")["language"] == "en" and jobs.load_transcript("nope") is None

s3.stop()
print("ok")
