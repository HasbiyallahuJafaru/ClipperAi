"""REST API over the shared project services: the backend the website runs on. Run from apps/backend:
uvicorn api:app --reload. Every route needs `Authorization: Bearer <Clerk session token>` (the website's /api proxy
sends the signed-in user's) and acts for that user's active Clerk organization, or the user when there is none.
Processing happens in `python jobs.py`.

Upload flow: POST /api/uploads -> PUT the file to upload_url -> POST /api/projects {"source": "upload:<id>"}.
Files are served as signed storage links on each clip (video_url, captions_url, thumbnail_url).
Publishing: GET /api/publishing/channels -> POST .../clips/{idx}/publish {"channels": [...], "due_at": optional}.
Calendar: POST /api/projects/{id}/calendar/plan (preview) -> POST /api/projects/{id}/calendar (queues the posts; the
worker hands them to Buffer) -> GET .../publications for their status.
Plan limits answer 402 and publishing problems 409/422/502, with a message people can read."""
import os
import json
import threading
import time
from contextlib import asynccontextmanager
from typing import Annotated
from uuid import UUID

from clerk_backend_api.security import authenticate_request
from clerk_backend_api.security.types import AuthenticateRequestOptions
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
import redis

import billing
import clipper
import db
import jobs
import oauth
import payments
import publishing

clipper.load_env()
REQUIRED = ("CLERK_SECRET_KEY", "S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_BUCKET")


def signed_in(request: Request) -> str:
    """The owner a request acts for: the Clerk organization active in the session, else the Clerk user. 401 unless
    the bearer token is a valid Clerk session token from one of this deployment's sites or the mobile app."""
    state = authenticate_request(request, AuthenticateRequestOptions(
        secret_key=os.environ["CLERK_SECRET_KEY"], accepts_token=["session_token"]))
    sites = os.environ.get("CLERK_AUTHORIZED_PARTIES", "http://127.0.0.1:3000,http://localhost:3000").split(",")
    # Browser tokens name their site (azp) and must be ours; the mobile app's native tokens carry none. The SDK's own
    # authorized_parties check would reject the app, so the site is checked here.
    if not state.is_signed_in or state.payload.get("azp", sites[0]) not in sites:
        raise HTTPException(401, "Sign in to continue.")
    owner = state.payload.get("org_id") or state.payload["sub"]
    gentle(owner)
    return owner


Owner = Annotated[str, Depends(signed_in)]

# In-memory fixed-window rate limiting. Exact when one process serves all traffic; on Railway, Redis (REDIS_URL,
# the plugin's own variable) counts across instances and restarts instead, with the dict as the fallback if Redis
# is briefly down. The windows to tighten are the ones that cost money (uploads, projects, checkout) and the
# public payment webhook.
_redis = redis.Redis.from_url(url, socket_timeout=2) if (url := os.environ.get("REDIS_URL")) else None
_buckets: dict[str, tuple[float, int]] = {}
_bucket_lock = threading.Lock()


def limited(key: str, cap: int, window: float = 60.0) -> bool:
    """True when `key` has already been used `cap` times in the current window. Call before doing the work."""
    if _redis is not None:
        try:
            name = f"rl:{key}"
            if (count := _redis.incr(name)) == 1:
                _redis.expire(name, int(window))
            return count > cap
        except redis.RedisError:
            pass  # Redis briefly unreachable: the in-memory bucket below still limits this process
    now = time.monotonic()
    with _bucket_lock:
        start, count = _buckets.get(key, (now, 0))
        if now - start >= window:
            start, count = now, 0
        _buckets[key] = (start, count + 1)
        if len(_buckets) > 10_000:  # a sweep now and then: strangers' one-off keys can't grow the dict forever
            for k, (s, _) in list(_buckets.items()):
                if now - s >= window:
                    _buckets.pop(k, None)
        return count >= cap


def gentle(owner: str):
    """Signed-in users get a wide general cap; the expensive routes add their own tighter one."""
    if limited(f"owner:{owner}", 240):
        raise HTTPException(429, "Too many requests. Try again in a minute.")


@asynccontextmanager
async def lifespan(_):
    if missing := [k for k in REQUIRED if not os.environ.get(k)]:
        raise RuntimeError(f"set {', '.join(missing)} in {clipper.HERE / '.env'}")
    db.migrate()
    yield


app = FastAPI(title="YT-Clipper", lifespan=lifespan)


@app.exception_handler(billing.LimitError)
def limit_reached(_, error: billing.LimitError):
    return JSONResponse({"detail": str(error)}, status_code=402)


@app.exception_handler(publishing.PublishError)
def cannot_publish(_, error: publishing.PublishError):
    return JSONResponse({"detail": str(error)}, status_code=error.status)


@app.exception_handler(oauth.ConnectError)
def cannot_connect(_, error: oauth.ConnectError):
    return JSONResponse({"detail": str(error)}, status_code=error.status)


@app.get("/health")
def health():  # Railway's healthcheck: no sign-in, no data; answers once startup (env check + migrations) is done
    return {"ok": True}


def found(project: dict | None) -> dict:
    if project is None:
        raise HTTPException(404, "project not found")
    return project


@app.post("/api/uploads", status_code=201)
def create_upload(owner: Owner, request: jobs.NewUpload):
    if limited(f"upload:{owner}", 10):
        raise HTTPException(429, "Too many uploads started. Try again in a minute.")
    billing.check_new_project(owner)  # before the file is sent, not after
    return jobs.create_upload(request)


@app.post("/api/projects", status_code=202)
def create_project(owner: Owner, request: jobs.NewProject):
    if limited(f"project:{owner}", 10):
        raise HTTPException(429, "Too many videos started. Try again in a minute.")
    return jobs.create_project(owner, request)


@app.get("/api/projects")
def list_projects(owner: Owner, limit: int = 50):
    return jobs.list_projects(owner, min(max(limit, 1), 200))


@app.get("/api/projects/{project_id}")
def get_project(owner: Owner, project_id: UUID):
    return found(jobs.get_project(owner, project_id))


@app.post("/api/projects/{project_id}/cancel")
def cancel_project(owner: Owner, project_id: UUID):
    if project := jobs.cancel_project(owner, project_id):
        return project
    found(jobs.get_project(owner, project_id))
    raise HTTPException(409, "project already finished")


@app.delete("/api/projects/{project_id}", status_code=204)
def delete_project(owner: Owner, project_id: UUID):
    if not jobs.delete_project(owner, project_id):
        if found(jobs.get_project(owner, project_id))["status"] in jobs.RUNNING:
            raise HTTPException(409, "project is still processing: cancel it first")
        raise HTTPException(409, "some of this project's posts haven't gone out yet: unschedule them first")


@app.patch("/api/projects/{project_id}/clips/{idx}")
def update_clip(owner: Owner, project_id: UUID, idx: int, edit: jobs.ClipEdit):
    if clip := jobs.update_clip(owner, project_id, idx, edit):
        return clip
    raise HTTPException(404, "clip not found")


@app.get("/api/projects/{project_id}/package")
def download_package(owner: Owner, project_id: UUID):
    if (package := jobs.content_package(owner, project_id)) is None:
        found(jobs.get_project(owner, project_id))
        raise HTTPException(409, "nothing to download: the project isn't finished, its files have expired,"
                                 " or every clip was rejected")
    return StreamingResponse(package, media_type="application/zip",
                             headers={"Content-Disposition": 'attachment; filename="content-package.zip"'})


@app.get("/api/publishing/channels")
def publishing_channels(owner: Owner):
    return publishing.channels(owner)


@app.get("/api/publishing/connection")
def publishing_connection(owner: Owner):
    """The owner's own connected Buffer account, or None (they're on the workspace key or nothing)."""
    return oauth.connection(owner)


@app.post("/api/publishing/connect/buffer", status_code=201)
def connect_buffer(owner: Owner):
    """Where to send the browser to authorize YT-Clipper on the owner's Buffer account."""
    return {"authorization_url": oauth.connect_url(owner, "buffer")}


@app.post("/api/publishing/callback", status_code=201)
def connect_callback(owner: Owner, request: oauth.Callback):
    """The website's /oauth/return page hands over the code and state Buffer left in its URL. The state must be one
    this very owner started, so accounts can't be linked to someone else."""
    if owner != oauth.state_owner(request.state):
        raise HTTPException(403, "This connection was started by another account. Start again on the Integrations page.")
    return oauth.callback(request.state, request.code)


@app.delete("/api/publishing/connection", status_code=204)
def disconnect_buffer(owner: Owner):
    oauth.disconnect(owner)


@app.post("/api/projects/{project_id}/clips/{idx}/publish", status_code=201)
def publish_clip(owner: Owner, project_id: UUID, idx: int, request: publishing.Publish):
    if (published := publishing.publish(owner, project_id, idx, request)) is None:
        raise HTTPException(404, "clip not found")
    return published


@app.post("/api/projects/{project_id}/calendar/plan")
def plan_calendar(owner: Owner, project_id: UUID, request: publishing.Calendar):
    return found(publishing.plan(owner, project_id, request))


@app.post("/api/projects/{project_id}/calendar", status_code=201)
def schedule_calendar(owner: Owner, project_id: UUID, request: publishing.Calendar):
    return found(publishing.schedule(owner, project_id, request))


@app.get("/api/projects/{project_id}/publications")
def list_publications(owner: Owner, project_id: UUID):
    return found(publishing.publications(owner, project_id))


@app.delete("/api/publications/{publication_id}", status_code=204)
def remove_publication(owner: Owner, publication_id: UUID):
    if publishing.remove(owner, publication_id) is None:
        raise HTTPException(404, "post not found")


@app.get("/api/billing")
def billing_summary(owner: Owner):
    return billing.summary(owner)


@app.post("/api/billing/checkout", status_code=201)
def start_checkout(owner: Owner, request: payments.Checkout):
    if limited(f"checkout:{owner}", 5):
        raise HTTPException(429, "Too many payment attempts. Try again in a minute.")
    return payments.checkout(owner, request.email, request.plan)


@app.get("/api/billing/payments/{reference}")
def payment_status(owner: Owner, reference: str):
    with db.connect() as c:
        payment = c.execute("select * from payments where reference = %s and owner = %s",
                            (reference, owner)).fetchone()
    if payment is None:
        raise HTTPException(404, "payment not found")
    return payment


@app.post("/api/payments/callback")
async def payment_callback(request: Request):
    """The provider's signed webhook. Only the signature and the once-per-reference apply() are trusted; the body's
    own claims never are (a verify is available in payments.reconcile()). Always answers 200 fast so the provider
    doesn't retry a payment that was already applied."""
    raw = await request.body()
    if limited(f"webhook:{request.client.host if request.client else 'unknown'}", 30):
        return {"ok": True}  # throttled: nothing was applied, and a 2xx stops pointless retries
    if not payments.signed(raw, request.headers.get("x-zoomguru-signature", "")):
        raise HTTPException(401, "bad signature")
    payments.apply(json.loads(raw)["reference"])
    return {"ok": True}


@app.post("/api/billing/subscribe", status_code=201)
def subscribe(owner: Owner, request: billing.Subscribe):
    return billing.subscribe(owner, request.plan)


@app.post("/api/billing/cancel")
def cancel_plan(owner: Owner):
    if subscription := billing.cancel(owner):
        return subscription
    raise HTTPException(409, "there's no plan to cancel")
