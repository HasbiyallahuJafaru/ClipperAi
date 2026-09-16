"""Clipping engine: video URL or file -> transcript -> best moments -> captioned, speaker-framed 9:16 clips
with thumbnails and per-platform post copy. Run by the worker (jobs.py).

needs ffmpeg + ffprobe on PATH and GROQ_API_KEY + DEEPSEEK_API_KEY in the environment or .env
"""
import hashlib
import json
import math
import os
import statistics
import subprocess
import sys
from pathlib import Path

import cv2
import yt_dlp
from openai import OpenAI
from pydantic import BaseModel

cv2.utils.logging.setLogLevel(cv2.utils.logging.LOG_LEVEL_ERROR)
HERE = Path(__file__).parent
FONTS = HERE / "fonts"  # Montserrat ExtraBold, SIL OFL (fonts/OFL.txt)
FACE_MODEL = HERE / "models" / "face_detection_yunet_2026may.onnx"  # MIT, opencv_zoo
CHUNK, OVERLAP = 600, 10  # seconds of audio per STT request, plus overlap past each seam (Groq's chunking advice)

PASS1 = """You scan a video transcript for moments that could become standalone short-form clips.
A good clip makes sense on its own: strong opening, one complete thought, clear payoff.
Prefer insight, story, strong opinion, surprise, humor and practical advice over mere loudness.
The first 1-2 seconds decide retention: a moment must open on a strong first line (a claim, question or
story jump), never mid-sentence filler like "so", "and", "anyway" or a back-reference like "like I said".
Each moment is {min:g}-{max:g} seconds, starts at a segment start, ends at a segment end, and does not overlap others.
Return json only, up to {n} moments:
{{"moments": [{{"start": 734.2, "end": 781.6, "score": 80, "reason": "why it works"}}]}}"""

PASS2 = """You are a senior short-form video editor. From the numbered candidate clips, pick the best {n} and write their copy.
Each candidate shows a little transcript before and after: use it to judge, never to include.
Drop any candidate that would not stand alone: one that opens mid-thought or on filler/back-reference ("so",
"anyway", "like I said"), leans on what comes before or after to make sense, or ends before its payoff lands.
Prefer clips whose first sentence is a hook strong enough to stop a scroll, and pick a diverse set: skip a
candidate that makes the same point as one you already picked.
You may trim a clip's edges to the nearest complete sentence by giving a tighter "start"/"end" (seconds,
within the candidate's own bounds); omit them to keep the candidate as-is.
Use only what is actually said in each clip. Write natively per platform: TikTok and Instagram casual with a few hashtags,
YouTube Shorts a searchable description, LinkedIn a professional takeaway, Facebook conversational, X under 280 characters.
Return json only, best clip first:
{{"clips": [{{"id": 3, "score": 94, "hook": "on-screen opening line, max 8 words", "title": "short title",
"description": "1-2 sentence summary", "hashtags": ["#example"],
"posts": {{"tiktok": "...", "instagram": "...", "youtube": "...", "linkedin": "...", "facebook": "...", "x": "..."}}}}]}}"""

ASS_HEADER = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,Montserrat,88,&H00FFFFFF,&H00FFFFFF,&H00000000,&H99000000,-1,0,0,0,100,100,0,0,1,7,3,2,80,80,560,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
HIGHLIGHT = "&H0000E6FF&"  # ASS colours are BGR: warm yellow


class PermanentError(Exception):
    """Retrying won't help (bad input, no speech)."""


class Moment(BaseModel):
    start: float
    end: float
    score: int
    reason: str


class Moments(BaseModel):
    moments: list[Moment]


class Posts(BaseModel):
    tiktok: str
    instagram: str
    youtube: str
    linkedin: str
    facebook: str
    x: str


class Pick(BaseModel):
    id: int
    score: int
    hook: str
    title: str
    description: str
    hashtags: list[str]
    posts: Posts
    start: float | None = None  # optional trim: must sit inside the candidate
    end: float | None = None


class Picks(BaseModel):
    clips: list[Pick]


class Clip(BaseModel):
    start: float
    end: float
    score: int
    reason: str
    hook: str
    title: str
    description: str
    hashtags: list[str]
    posts: Posts


def load_env(path=HERE / ".env"):
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            key, sep, value = line.partition("=")
            if sep and value.strip() and not key.startswith("#"):  # blank template keys stay unset
                os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


def ffmpeg(*args, cwd=None):
    # timeout bounds a hung encode so a worker can't sit on a job forever
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args], check=True, cwd=cwd, timeout=3600)


def duration_of(media: Path) -> float:
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0",
                                 str(media)], capture_output=True, text=True, check=True).stdout)


def acquire(source: str, root: Path, progress=lambda percent: None) -> tuple[Path, Path]:
    """Return (video, work dir). The work dir under `root` is named by content id (Youtube-<id>, file hash): that name
    is the transcript cache key. `progress(percent)` is called as a link downloads, in 5% steps."""
    if Path(source).is_file():
        with open(source, "rb") as f:
            work = root / hashlib.file_digest(f, "sha256").hexdigest()[:16]
        work.mkdir(parents=True, exist_ok=True)
        return Path(source), work
    if not source.startswith(("http://", "https://")):
        raise PermanentError(f"not a file or http(s) URL: {source}")
    opts = {
        "format": "bv*+ba/b",
        # prefer H.264/AAC: YouTube's default pick is often AV1, which is several times slower to decode on CPU
        "format_sort": ["res:1080", "vcodec:h264", "acodec:aac"],
        "merge_output_format": "mp4",
        "outtmpl": str(root / "%(extractor_key)s-%(id)s" / "source.%(ext)s"),
        "noplaylist": True,
        "js_runtimes": {"deno": {}, "node": {}},  # YouTube extraction needs a JS runtime now
        "retries": 10,  # the library defaults to no retries (only the CLI sets 10)
        "fragment_retries": 10,
        "quiet": True,
        "noprogress": True,
        "no_warnings": True,
        "progress_hooks": [lambda d: reported(d.get("downloaded_bytes"), d.get("total_bytes") or d.get("total_bytes_estimate"))],
    }
    if os.environ.get("YTDLP_PROXY"):  # YouTube blocks most cloud servers (Railway): route downloads through a proxy
        opts["proxy"] = os.environ["YTDLP_PROXY"]
    last = -5

    def reported(done, total):  # ponytail: percent of the current file; video and audio streams each count 0-100
        nonlocal last
        if done and total and (percent := min(100, int(done * 100 / total))) >= last + 5:
            last = percent
            progress(percent)

    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            video = Path(ydl.extract_info(source)["requested_downloads"][0]["filepath"])
    except yt_dlp.utils.DownloadError as e:
        if "not a bot" in str(e) or "Sign in to confirm" in str(e):
            raise PermanentError("YouTube blocked our server from downloading this video. Upload the video file"
                                 " instead, or try again later.") from e
        raise
    return video, video.parent


def stitch(transcript: dict, segments: list[dict], words: list[dict], offset: float, last: bool):
    """Append one chunk's results (times relative to the chunk) to the transcript. Chunks overlap past each seam,
    so a chunk keeps only items starting before its seam and skips items the previous chunk already covered."""
    seam = math.inf if last else offset + CHUNK
    for key, items in (("segments", segments), ("words", words)):
        kept = transcript[key]
        covered = kept[-1]["end"] - 0.05 if kept else -math.inf
        kept += [item | {"start": item["start"] + offset, "end": item["end"] + offset}
                 for item in items if covered <= item["start"] + offset < seam]


def transcribe(video: Path, work: Path) -> dict:
    """Groq Whisper over overlapping chunks. Returns {language, segments: [{start, end, text}], words: [...]}."""
    chunks = work / "audio"
    chunks.mkdir(parents=True, exist_ok=True)
    # SDK retries 5xx/429 with exponential backoff and honours retry-after; the default 2 retries is too few
    groq = OpenAI(base_url="https://api.groq.com/openai/v1", api_key=os.environ["GROQ_API_KEY"], max_retries=5)
    transcript = {"language": None, "segments": [], "words": []}
    offsets = range(0, max(1, math.ceil(duration_of(video) - OVERLAP)), CHUNK)
    for offset in offsets:
        # Each chunk is its own complete file: ffmpeg's segment muxer writes FLAC pieces whose headers claim the
        # whole stream's length, and Groq returns 500 on those. 16 kHz mono s16 FLAC: 610 s <= 19.5 MB < 25 MB cap.
        chunk = chunks / f"{offset:05}.flac"
        ffmpeg("-ss", str(offset), "-t", str(CHUNK + OVERLAP), "-i", str(video), "-vn", "-ac", "1", "-ar", "16000",
               "-sample_fmt", "s16", "-c:a", "flac", str(chunk))
        with open(chunk, "rb") as f:
            r = groq.audio.transcriptions.create(
                model="whisper-large-v3-turbo", file=f,
                response_format="verbose_json", timestamp_granularities=["word", "segment"])
        transcript["language"] = transcript["language"] or r.language
        stitch(transcript,
               [{"start": s.start, "end": s.end, "text": s.text.strip()} for s in r.segments or []],
               [{"word": w.word.strip(), "start": w.start, "end": w.end} for w in r.words or []],
               offset, last=offset == offsets[-1])
    return transcript


def ask_json(model: str, system: str, user: str, parse):
    """Call DeepSeek in JSON mode; `parse` validates (raises ValueError on bad output). Up to 3 tries."""
    deepseek = OpenAI(base_url="https://api.deepseek.com", api_key=os.environ["DEEPSEEK_API_KEY"], max_retries=5)
    for attempt in range(1, 4):
        r = deepseek.chat.completions.create(
            model=model, response_format={"type": "json_object"}, max_tokens=64000,  # 30 clips of copy ~12K tokens plus thinking
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}])
        try:
            return parse(r.choices[0].message.content or "{}")
        except ValueError as e:  # pydantic's ValidationError is a ValueError
            print(f"rejected {model} output (attempt {attempt}): {e}", file=sys.stderr)
    raise RuntimeError(f"{model} never returned usable output")


def parse_moments(content: str, duration: float, min_len: float, max_len: float) -> list[Moment]:
    """Never trust model output: drop moments outside the video or off the length range; on overlap keep the
    higher score. Returns chronological order."""
    kept = []
    for m in sorted(Moments.model_validate_json(content).moments, key=lambda m: -m.score):
        if (0 <= m.start < m.end <= duration + 1 and min_len * 0.8 <= m.end - m.start <= max_len * 1.2
                and all(m.end <= k.start or m.start >= k.end for k in kept)):
            kept.append(m)
    if not kept:
        raise ValueError("no usable moments")
    return sorted(kept, key=lambda m: m.start)


def parse_picks(content: str, moments: list[Moment], n: int, min_len: float = 0,
                max_len: float = math.inf) -> list[Clip]:
    """Timestamps always come from pass 1; pass 2 may only choose candidate ids, optionally trim a clip inside
    its own bounds (trims outside the length range are ignored), and write copy."""
    clips, used = [], set()
    for p in Picks.model_validate_json(content).clips:
        if 0 <= p.id < len(moments) and p.id not in used:
            used.add(p.id)
            m = moments[p.id]
            start, end = m.start, m.end
            if p.start is not None and p.end is not None and m.start <= p.start < p.end <= m.end \
                    and min_len * 0.8 <= p.end - p.start <= max_len * 1.2:
                start, end = p.start, p.end
            clips.append(Clip(start=start, end=end, reason=m.reason, **p.model_dump(exclude={"id", "start", "end"})))
    if not clips:
        raise ValueError("no valid candidate ids")
    return clips[:n]


def find_clips(transcript: dict, n: int, min_len: float, max_len: float) -> list[Clip]:
    """Two passes: the cheap model scans the whole transcript for ~3n candidates, the strong model reads those
    candidates with a little surrounding context, drops the ones that don't stand alone, picks the best diverse
    set and writes hooks, titles and per-platform posts."""
    segments, words = transcript["segments"], transcript["words"]
    lines = "\n".join(f"[{s['start']:.1f}-{s['end']:.1f}] {s['text']}" for s in segments)
    moments = ask_json("deepseek-flash", PASS1.format(min=min_len, max=max_len, n=min(3 * n, 90)), lines,
                       lambda c: parse_moments(c, segments[-1]["end"], min_len, max_len))
    said = lambda a, b: " ".join(w["word"] for w in words if a <= w["start"] < b)
    candidates = "\n\n".join(
        f"#{i} ({m.end - m.start:.0f}s) {m.reason}\n"
        f"before: {said(m.start - 15, m.start) or '(silence)'}\n"
        f"{said(m.start, m.end)}\n"
        f"after: {said(m.end, m.end + 15) or '(silence)'}"
        for i, m in enumerate(moments))
    return ask_json("deepseek-v4-pro", PASS2.format(n=n), candidates,
                    lambda c: parse_picks(c, moments, n, min_len, max_len))


def snap(start: float, end: float, words: list[dict]) -> tuple[float, float]:
    """Move cut points to sentence boundaries where one sits within 1.5s, else to whole words: never start a
    clip mid-sentence or end it between sentences."""
    sentence_starts = [w["start"] for a, w in zip(words, words[1:]) if a["word"][-1:] in ".?!"]
    sentence_ends = [w["end"] for w in words if w["word"][-1:] in ".?!"]
    near = lambda t, edges: min((e for e in edges if abs(e - t) <= 1.5), key=lambda e: abs(e - t), default=None)
    s, e = near(start, sentence_starts), near(end, sentence_ends)
    start = s if s is not None else max((w["start"] for w in words if w["start"] <= start + 0.2), default=start)
    end = e if e is not None else min((w["end"] for w in words if w["end"] >= end - 0.2), default=end)
    return start, end


def face_xs(video: Path, start: float, end: float, fps: float) -> tuple[int, int, list[float | None]]:
    """Sample frames at `fps`; return frame size and the largest face's center x per sample (None = no face)."""
    # ponytail: largest face = speaker; use mouth movement or diarization when two-person shots pick the wrong one
    cap = cv2.VideoCapture(str(video))
    cap.set(cv2.CAP_PROP_POS_MSEC, start * 1000)
    detector, xs, w, h, next_t = None, [], 0, 0, start
    while cap.grab():
        t = cap.get(cv2.CAP_PROP_POS_MSEC) / 1000
        if t > end:
            break
        if t < next_t:
            continue
        next_t += 1 / fps
        frame = cap.retrieve()[1]
        h, w = frame.shape[:2]
        scale = 640 / w
        small = cv2.resize(frame, None, fx=scale, fy=scale)
        if detector is None:
            detector = cv2.FaceDetectorYN.create(str(FACE_MODEL), "", (small.shape[1], small.shape[0]), 0.7)
        faces = detector.detect(small)[1]
        if faces is None:
            xs.append(None)
        else:
            x, _, fw, _ = max(faces, key=lambda f: f[2] * f[3])[:4]
            xs.append(float(x + fw / 2) / scale)
    cap.release()
    return w, h, xs


def shots(xs: list[float], deadzone: float, hold: int = 3) -> list[tuple[int, float]]:
    """Split per-sample positions into steady shots: (first sample, median x). A move only counts once it
    holds for `hold` samples, so the crop cuts cleanly to a new position instead of wobbling."""
    # ponytail: hard cuts suit static podcast cameras; add eased pans if handheld/walking footage looks choppy
    starts, ref = [0], xs[0]
    for i in range(1, len(xs) - hold + 1):
        run = xs[i:i + hold]
        if abs(run[0] - ref) > deadzone and max(run) - min(run) <= deadzone:
            starts.append(i)
            ref = statistics.median(run)
    return [(s, statistics.median(xs[s:e])) for s, e in zip(starts, starts[1:] + [len(xs)])]


def crop_filter(video: Path, start: float, end: float, fps: float = 4) -> str:
    """9:16 crop that follows the speaker's face, falling back to center crop when no face is found."""
    w, h, xs = face_xs(video, start, end, fps)
    cw, ch = min(w, h * 9 // 16) // 2 * 2, min(h, w * 16 // 9) // 2 * 2
    seen = [x for x in xs if x is not None]
    if not seen or cw == w:
        return "crop='min(iw,ih*9/16)':'min(ih,iw*16/9)'"
    filled, last = [], seen[0]
    for x in xs:  # frames without a face keep the last known position
        last = last if x is None else x
        filled.append(last)
    parts = [(i / fps, round(min(max(x - cw / 2, 0), w - cw))) for i, x in shots(filled, cw * 0.2)]
    expr = str(parts[-1][1])
    for (t_next, _), (_, x) in zip(reversed(parts[1:]), reversed(parts[:-1])):
        expr = f"if(lt(t,{t_next:.2f}),{x},{expr})"
    return f"crop={cw}:{ch}:'{expr}':0"


def ass_escape(text: str) -> str:
    return text.replace("\\", "").replace("{", "(").replace("}", ")")


def captions(words: list[dict], start: float, end: float) -> str:
    """ASS subtitles from the real transcript words: short groups, the spoken word highlighted."""
    def ts(t):
        cs = max(0, round((t - start) * 100))
        return f"{cs // 360000}:{cs // 6000 % 60:02}:{cs // 100 % 60:02}.{cs % 100:02}"

    groups = []
    for w in (w | {"word": ass_escape(w["word"])} for w in words if start <= w["start"] < end and w["word"]):
        g = groups[-1] if groups else []
        if (g and len(g) < 3 and len(" ".join(x["word"] for x in g)) + len(w["word"]) < 18
                and w["start"] - g[-1]["end"] < 0.5 and g[-1]["word"][-1] not in ".?!,"):
            g.append(w)
        else:
            groups.append([w])

    lines = [ASS_HEADER]
    for gi, g in enumerate(groups):
        next_start = groups[gi + 1][0]["start"] if gi + 1 < len(groups) else end
        for i, w in enumerate(g):
            until = g[i + 1]["start"] if i + 1 < len(g) else min(next_start, w["end"] + 0.5)
            text = " ".join(f"{{\\c{HIGHLIGHT}}}{x['word']}{{\\r}}" if x is w else x["word"] for x in g)
            lines.append(f"Dialogue: 0,{ts(w['start'])},{ts(until)},Caption,,0,0,0,,{text}")
    return "\n".join(lines) + "\n"


def render(video: Path, start: float, end: float, out: Path, words: list[dict], burn: bool = True):
    """Write out (mp4), its .ass captions and a .jpg cover. `burn`: draw the captions into the video (off when the
    source already has its own); the .ass file is written either way, for other editors."""
    out = out.resolve()
    out.with_suffix(".ass").write_text(captions(words, start, end), encoding="utf-8")
    # cwd = output dir and relative paths, so filter args carry no Windows drive colons (they break filter parsing)
    fonts = Path(os.path.relpath(FONTS, out.parent)).as_posix()
    burned = f",ass={out.stem}.ass:fontsdir={fonts}" if burn else ""
    ffmpeg("-ss", f"{start:.3f}", "-i", str(video.resolve()), "-t", f"{end - start:.3f}",
           "-vf", f"{crop_filter(video, start, end)},scale=1080:1920,setsar=1{burned}",
           "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-ar", "48000",
           "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
           "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", out.name, cwd=out.parent)
    # cover = frame at 1 s: the speaker already framed
    ffmpeg("-ss", "1", "-i", out.name, "-frames:v", "1", "-q:v", "3", out.with_suffix(".jpg").name, cwd=out.parent)


def run(source: str, out: Path, n: int | None = None, min_len: float = 30, max_len: float = 60, *,
        progress, load_transcript, save_transcript, work_root: Path,
        max_seconds: float | None = None, max_clips: int | None = None, captions: bool = True
        ) -> tuple[str, Path, list[Clip]]:
    """The whole pipeline. `progress(stage, detail)` is called at every step (it may raise to cancel); transcripts
    are cached by source key through load/save; downloads go under `work_root`. `max_seconds` / `max_clips` cap the
    source length and clip count (plan allowances), checked before anything is paid for. `captions`: burn captions
    into the clips (the caption files are made either way). Returns (source key, out dir, clips)."""
    progress("downloading")
    video, work = acquire(source, work_root, lambda percent: progress("downloading", f"{percent}%"))
    if max_seconds is not None and (seconds := duration_of(video)) > max_seconds:
        raise PermanentError(f"this video is {seconds / 60:.0f} minutes long, but only {max_seconds / 60:.0f} minutes"
                             " of video are left in your plan this month")
    key = work.name
    progress("transcribing")
    transcript = load_transcript(key)
    if transcript is None:
        transcript = transcribe(video, work)
        save_transcript(key, transcript)
    if not transcript["segments"]:
        raise PermanentError("no speech found in the video")

    progress("analyzing")
    n = n or max(3, min(30, round(transcript["segments"][-1]["end"] / 60)))  # about one clip per minute
    clips = find_clips(transcript, n if max_clips is None else min(n, max_clips), min_len, max_len)

    out.mkdir(parents=True, exist_ok=True)
    for i, clip in enumerate(clips, 1):
        progress("rendering", f"clip {i} of {len(clips)}")
        clip.start, clip.end = snap(clip.start, clip.end, transcript["words"])
        render(video, max(0, clip.start - 0.1), clip.end + 0.2, out / f"clip{i:02}.mp4", transcript["words"], captions)
    (out / "clips.json").write_text(json.dumps([c.model_dump() for c in clips], indent=2, ensure_ascii=False),
                                    encoding="utf-8")
    return key, out, clips
