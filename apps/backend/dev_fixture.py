"""Test data for apps/website/walkthrough.mjs, against `python dev.py` only (local dev database + fake S3).
Removes the workspace's plan and adds a completed project with two clips (tiny media, real clip text).
Prints: <project id> <media folder>.   usage: python dev_fixture.py"""
import os
import shutil
import subprocess
import sys

from psycopg.types.json import Jsonb

os.environ |= {"S3_ENDPOINT": "http://127.0.0.1:9000", "S3_ACCESS_KEY_ID": "dev", "S3_SECRET_ACCESS_KEY": "dev",
               "S3_BUCKET": "dev"}  # dev.py's fake S3, never R2
import clipper  # noqa: E402

clipper.load_env()  # same settings dev.py sees
if os.environ.get("DATABASE_URL"):
    sys.exit("refusing: DATABASE_URL is set; this only runs against the local dev database")
import db  # noqa: E402
import jobs  # noqa: E402
import storage  # noqa: E402

media = jobs.TMP / "fixture-media"
shutil.rmtree(media, ignore_errors=True)
media.mkdir(parents=True)
posts = dict.fromkeys(clipper.Posts.model_fields, "A post written for this platform. #clips")
clips = [{"start": 24.1, "end": 55.8, "score": 95, "hook": "They shoved a PC into this keyboard.",
          "title": "PC in a Keyboard", "description": "A desktop-class PC inside a 20 mm keyboard.",
          "reason": "Surprising product with a clear payoff.", "hashtags": ["#tech"], "posts": posts},
         {"start": 928.0, "end": 964.0, "score": 93, "hook": "These earbuds never need charging.",
          "title": "Spring-Loaded Earbuds", "description": "Earbuds that charge from your phone.",
          "reason": "Clever idea, practical payoff.", "hashtags": ["#gadgets"], "posts": posts}]
for i, color in ((1, "0x1d4ed8"), (2, "0x15803d")):  # ~25 KB each: small enough for any local proxy/antivirus
    video = media / f"clip{i:02}.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"color=c={color}:s=270x480:d=4", "-f", "lavfi",
                    "-i", "sine=duration=4", "-shortest", "-c:v", "libx264", "-b:v", "60k", "-c:a", "aac", "-b:a",
                    "32k", str(video)], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", "1", "-i", str(video), "-frames:v", "1",
                    str(media / f"clip{i:02}.jpg")], check=True)
    (media / f"clip{i:02}.ass").write_text(clipper.captions([], 0, 4, clips[i - 1]["hook"]), encoding="utf-8")

with db.connect() as c:
    c.execute("delete from subscriptions")  # the walkthrough starts without a plan
    project = c.execute("insert into projects (source, options, status, finished_at) values"
                        " ('https://youtu.be/VTLnDqjfRZQ', %s, 'completed', now()) returning id",
                        (Jsonb({"n": 2, "min_len": 30, "max_len": 60}),)).fetchone()["id"]
    for i, clip in enumerate(clips, 1):
        c.execute("insert into clips (project_id, idx, start_s, end_s, score, reason, hook, title, description,"
                  " hashtags, posts) values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                  (project, i, clip["start"], clip["end"], clip["score"], clip["reason"], clip["hook"], clip["title"],
                   clip["description"], Jsonb(clip["hashtags"]), Jsonb(clip["posts"])))
for f in sorted(media.glob("clip*")):
    storage.put(f, f"projects/{project}/{f.name}", jobs.CONTENT_TYPES[f.suffix])
print(project, media)
