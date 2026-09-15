"""Checks for the engine logic that doesn't need APIs (ffmpeg must be on PATH). Run: python test_clipper.py"""
import json
import subprocess
import tempfile
from pathlib import Path

from pydantic import ValidationError

import clipper
from clipper import CHUNK, Moment, captions, parse_moments, parse_picks, shots, snap, stitch

words = [{"word": "a", "start": 0.0, "end": 0.4}, {"word": "b", "start": 0.5, "end": 1.0},
         {"word": "c", "start": 1.1, "end": 1.6}]
assert snap(0.7, 1.3, words) == (0.5, 1.6), "mid-word cuts widen to whole words"
assert snap(0.45, 1.05, words) == (0.5, 1.0), "gap cuts land on the neighbouring word edges"
assert snap(5, 6, []) == (5, 6), "no word timings -> unchanged"

# pass 1: invalid moments dropped, overlap keeps the higher score, result is chronological
moment = '{{"start": {}, "end": {}, "score": {}, "reason": "{}"}}'
content = '{"moments": [' + ",".join([moment.format(300, 340, 70, "later"), moment.format(10, 50, 90, "t"),
                                      moment.format(100, 400, 80, "too long"), moment.format(590, 640, 70, "past end"),
                                      moment.format(30, 70, 95, "overlaps t")]) + "]}"
assert [m.reason for m in parse_moments(content, duration=600, min_len=30, max_len=60)] == ["overlaps t", "later"]
for bad in ["", "not json", '{"moments": [{"start": 1}]}']:
    try:
        parse_moments(bad, 600, 30, 60)
        raise AssertionError(f"accepted bad output: {bad!r}")
    except ValidationError:
        pass
try:
    parse_moments('{"moments": []}', 600, 30, 60)
    raise AssertionError("accepted empty list")
except ValueError:
    pass

# pass 2: timestamps come from pass 1, unknown/duplicate ids ignored, capped at n
moments = [Moment(start=10, end=50, score=90, reason="r0"), Moment(start=100, end=140, score=80, reason="r1")]
posts = dict.fromkeys(["tiktok", "instagram", "youtube", "linkedin", "facebook", "x"], "copy")
pick = lambda i, title: {"id": i, "score": 9, "hook": "h", "title": title, "description": "d", "hashtags": ["#a"],
                         "posts": posts}
content = json.dumps({"clips": [pick(1, "one"), pick(7, "ghost"), pick(1, "dupe"), pick(0, "zero")]})
clips = parse_picks(content, moments, n=5)
assert [(c.title, c.start, c.reason) for c in clips] == [("one", 100, "r1"), ("zero", 10, "r0")]
assert len(parse_picks(content, moments, n=1)) == 1
try:
    parse_picks(json.dumps({"clips": [pick(0, "no posts") | {"posts": {"tiktok": "only one"}}]}), moments, 5)
    raise AssertionError("accepted a pick without every platform's post")
except ValidationError:
    pass

# chunk stitching: chunk 2 starts at the seam and re-hears the tail of chunk 1
t = {"language": None, "segments": [], "words": []}
w = lambda text, s, e: {"word": text, "start": s, "end": e}
stitch(t, [], [w("before", 590, 599.7), w("across", 599.8, 600.4), w("overlap", 600.5, 601)], 0, last=False)
stitch(t, [], [w("cross", 0.0, 0.4), w("overlap", 0.5, 1.0), w("next", 1.2, 1.5)], CHUNK, last=True)
assert [(x["word"], x["start"]) for x in t["words"]] == \
    [("before", 590), ("across", 599.8), ("overlap", 600.5), ("next", 601.2)], t["words"]

# regression: every audio chunk must be a standalone file whose header matches its own length
# (ffmpeg's segment muxer once produced a last chunk claiming the whole stream's duration -> Groq 500)
with tempfile.TemporaryDirectory() as tmp:
    src = Path(tmp) / "tone.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "sine=duration=25", str(src)], check=True)
    clipper.CHUNK, clipper.OVERLAP = 10, 2
    clipper.os.environ.setdefault("GROQ_API_KEY", "test")
    calls = []

    class FakeGroq:
        def __init__(self, **_):
            self.audio = self
            self.transcriptions = self

        def create(self, file, **_):
            calls.append(clipper.duration_of(Path(file.name)))
            return type("R", (), {"language": "en", "segments": [], "words": []})()

    clipper.OpenAI, real_openai = FakeGroq, clipper.OpenAI
    try:
        clipper.transcribe(src, Path(tmp))
    finally:
        clipper.OpenAI, clipper.CHUNK, clipper.OVERLAP = real_openai, 600, 10
    assert [round(d) for d in calls] == [12, 12, 5], calls

    # plan allowances: a too-long source stops before transcription; the clip count is capped before selection
    def never(*_):
        raise AssertionError("must stop before transcription")
    engine = {"progress": lambda *_: None, "save_transcript": never, "work_root": Path(tmp)}
    try:
        clipper.run(str(src), Path(tmp) / "out", load_transcript=never, max_seconds=10, **engine)
        raise AssertionError("accepted a source longer than the allowance")
    except clipper.PermanentError as e:
        assert "minutes of video are left" in str(e)
    asked = []
    clipper.find_clips, real_find = lambda transcript, n, *_: asked.append(n) or [], clipper.find_clips
    try:
        hour = {"language": "en", "words": [], "segments": [{"start": 0, "end": 3600, "text": "x"}]}
        clipper.run(str(src), Path(tmp) / "out", load_transcript=lambda _: hour, max_clips=4, **engine)
        clipper.run(str(src), Path(tmp) / "out", load_transcript=lambda _: hour, **engine)
    finally:
        clipper.find_clips = real_find
    assert asked == [4, 10], asked

ass = captions([{"word": "Most", "start": 10.0, "end": 10.3}, {"word": "companies", "start": 10.3, "end": 10.9},
                {"word": "fail.", "start": 11.0, "end": 11.4}, {"word": "{Why?}", "start": 12.5, "end": 12.9},
                {"word": "outside", "start": 30.0, "end": 30.5}], start=9.9, end=20, hook="The mistake")
events = [line for line in ass.splitlines() if line.startswith("Dialogue")]
assert events[0] == "Dialogue: 1,0:00:00.00,0:00:03.00,Hook,,0,0,0,,The mistake"
assert events[1] == "Dialogue: 0,0:00:00.10,0:00:00.40,Caption,,0,0,0,,{\\c&H0000E6FF&}Most{\\r} companies"
assert events[2] == "Dialogue: 0,0:00:00.40,0:00:01.10,Caption,,0,0,0,,Most {\\c&H0000E6FF&}companies{\\r}", \
    "18-char line limit splits off 'fail.'; group holds until the next one starts (no flicker)"
assert events[3].split(",")[2] == "0:00:02.00", "before a pause, the last word lingers 0.5s"
assert events[4].endswith(",{\\c&H0000E6FF&}(Why?){\\r}") and len(events) == 5, "braces escaped; out-of-range word dropped"

# a face that jitters around 400 then moves to 1400 for good -> exactly two steady shots, cut at the move
xs = [400, 410, 395, 1400, 405, 400, 1400, 1395, 1410, 1405]
assert shots(xs, deadzone=120) == [(0, 402.5), (6, 1402.5)], shots(xs, 120)
assert shots([500.0], 120) == [(0, 500.0)]

print("ok")
