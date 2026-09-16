"""A stand-in for the part of Buffer's GraphQL API that publishing.py uses, for test_jobs.py and
`python dev.py --fake-buffer`. Answers in Buffer's real shapes (checked against api.buffer.com, 2026-09-15), refuses
the inputs Buffer refuses, reads the video link like Buffer does (when the post is created and when it's sent; signed
links can't be read), keeps posts in memory, and "sends" a post once its time has come and someone asks about it.
Set `fail` to act out trouble: "unauthorized", "rate_limited", "down", or any other text = createPost refuses with it."""
import json
import threading
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

KEY = "fake-buffer-key"


def readable(url: str) -> bool:
    """Real Buffer can't read signed storage links; anything else must hand over the file (first KB is enough)."""
    if "X-Amz-Signature" in url:
        return False
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"Range": "bytes=0-1023"}), timeout=10) as response:
            return response.status in (200, 206)
    except OSError:
        return False


def channel(service, name, type="business", **fields):
    return {"id": f"channel-{service}", "service": service, "type": type, "name": name, "displayName": name.title(),
            "isDisconnected": False, "isLocked": False} | fields


class FakeBuffer:
    def __init__(self):
        self.channels = [channel("tiktok", "clipperdemo"), channel("youtube", "clipper demo", "channel"),
                         channel("instagram", "clipper.demo"), channel("twitter", "clipperdemo", "profile"),
                         channel("linkedin", "clipper demo", "profile", isDisconnected=True),
                         channel("pinterest", "clipperdemo"),
                         channel("instagram", "clipper.personal", "profile", id="channel-instagram-personal")]
        self.posts, self.inputs, self.fail, self.calls = {}, {}, None, 0
        self.access_tokens, self.refresh_tokens, self.issued = set(), set(), 0  # the auth server's state
        fake = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                fake.calls += 1
                request = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                bearer = (self.headers.get("Authorization") or "").removeprefix("Bearer ")
                if bearer != KEY and bearer not in fake.access_tokens or fake.fail == "unauthorized":
                    return self.reply(401, {"errors": [{"message": "Access token is not valid",
                                                        "extensions": {"code": "UNAUTHENTICATED"}}]})
                if fake.fail == "rate_limited":
                    return self.reply(429, {"errors": [{"message": "Too many requests from this client.",
                                                        "extensions": {"code": "RATE_LIMIT_EXCEEDED"}}]},
                                      {"Retry-After": "753"})
                if fake.fail == "down":
                    return self.reply(503, {})
                self.reply(200, fake.answer(request["query"], request["variables"]))

            def reply(self, status, body, headers=None):
                data = json.dumps(body).encode()
                self.send_response(status)
                for name, value in ({"Content-Type": "application/json", "Content-Length": len(data)} | (headers or {})).items():
                    self.send_header(name, str(value))
                self.end_headers()
                self.wfile.write(data)

            def log_message(self, *args):
                pass

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.server.server_port}"

        class AuthHandler(BaseHTTPRequestHandler):
            """auth.buffer.com's token endpoint for OAuth tests: an authorization code becomes a token pair, and a
            refresh token works exactly once (rotated, like the real one)."""
            def do_POST(self):
                form = dict(urllib.parse.parse_qsl(self.rfile.read(int(self.headers["Content-Length"])).decode()))
                if form.get("client_secret") not in (None, "", KEY):  # public clients send no secret (PKCE alone)
                    return self.reply(401, {"error": "invalid_client"})
                if form["grant_type"] == "authorization_code":
                    return self.reply(200, fake.issue())
                if form["grant_type"] == "refresh_token" and form["refresh_token"] in fake.refresh_tokens:
                    fake.refresh_tokens.discard(form["refresh_token"])  # single use: a replay is refused
                    return self.reply(200, fake.issue())
                self.reply(400, {"error": "invalid_grant"})

            def reply(self, status, body):
                data = json.dumps(body).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def log_message(self, *args):
                pass

        self.auth_server = ThreadingHTTPServer(("127.0.0.1", 0), AuthHandler)
        self.auth_url = f"http://127.0.0.1:{self.auth_server.server_port}"
        for server in (self.server, self.auth_server):
            threading.Thread(target=server.serve_forever, daemon=True).start()

    def issue(self) -> dict:
        self.issued += 1
        access, refresh = f"at-{self.issued}", f"rt-{self.issued}"
        self.access_tokens.add(access)
        self.refresh_tokens.add(refresh)
        return {"access_token": access, "refresh_token": refresh, "expires_in": 3600, "token_type": "Bearer"}

    def answer(self, query: str, variables: dict) -> dict:
        if "createPost" in query:
            return {"data": {"createPost": self.create(variables["input"])}}
        if "deletePost" in query:
            if self.posts.pop(variables["id"], None) is None:
                return {"data": {"deletePost": {"message": "Document not found"}}}
            return {"data": {"deletePost": {"id": variables["id"]}}}
        if "post(input" in query:
            if (post := self.posts.get(variables["id"])) is None:
                return {"errors": [{"message": f"Post not found for id: {variables['id']}", "path": ["post"],
                                    "extensions": {"code": "NOT_FOUND"}}], "data": None}
            now = datetime.now(timezone.utc)
            if post["status"] == "sending" or post["status"] == "scheduled" and datetime.fromisoformat(post["dueAt"]) <= now:
                if readable(self.inputs[post["id"]]["assets"][0]["video"]["url"]):
                    post |= {"status": "sent", "sentAt": now.isoformat(), "externalLink": f"https://example.com/{post['id']}"}
                else:
                    post |= {"status": "error", "error": {"message": "Video could not be read from its URL."}}
            return {"data": {"post": post}}
        if "channels(" in query:
            return {"data": {"channels": self.channels}}
        if "organizations" in query:
            return {"data": {"account": {"organizations": [{"id": "organization-1"}]}}}
        raise ValueError(f"fake Buffer doesn't know this query: {query}")

    def create(self, post: dict) -> dict:
        target = next((c for c in self.channels if c["id"] == post["channelId"]), None)
        if target is None:
            return {"message": "Channel not found"}
        service, metadata = target["service"], (post.get("metadata") or {}).get(target["service"]) or {}
        if service == "instagram" and target["type"] == "profile" and post["schedulingType"] == "automatic":
            return {"message": "Instagram personal profile channels require notification scheduling. Use notification"
                               " scheduling instead."}  # the real API's words, seen 2026-09-15
        if self.fail:
            return {"message": self.fail}
        if post["mode"] == "customScheduled" and not post.get("dueAt"):
            return {"message": "dueAt is required for customScheduled posts"}
        if service == "youtube" and not metadata.get("title"):
            return {"message": "YouTube posts need a title"}
        if service == "youtube" and not metadata.get("categoryId"):  # the real API's words, seen 2026-09-15
            return {"message": "Invalid post: YouTube posts require a category."}
        if service in ("instagram", "facebook") and not metadata.get("type"):
            return {"message": f"{service} posts need a type"}
        if not all(readable(a["video"]["url"]) for a in post["assets"]):
            return {"message": "Invalid post: Video could not be read from its URL."}
        post_id = uuid.uuid4().hex[:24]
        self.inputs[post_id] = post
        self.posts[post_id] = {"id": post_id, "status": "scheduled" if post.get("dueAt") else "sending",
                               "dueAt": post.get("dueAt"), "sentAt": None, "externalLink": None, "error": None}
        return {"post": self.posts[post_id]}
