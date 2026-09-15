"""REST API over the shared project services. Run from apps/backend:  uvicorn api:app --reload
Every route needs `Authorization: Bearer <API_KEY>` (API_KEY in .env). Processing happens in `python jobs.py`.

Upload flow: POST /api/uploads -> PUT the file to upload_url -> POST /api/projects {"source": "upload:<id>"}.
Files are served as signed storage links on each clip (video_url, captions_url, thumbnail_url).
Publishing: GET /api/publishing/channels -> POST .../clips/{idx}/publish {"channels": [...], "due_at": optional}.
Calendar: POST /api/projects/{id}/calendar/plan (preview) -> POST /api/projects/{id}/calendar (queues the posts; the
worker hands them to Buffer) -> GET .../publications for their status.
Plan limits answer 402 and publishing problems 409/422/502, with a message people can read."""
import os
import secrets
from contextlib import asynccontextmanager
from uuid import UUID

from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

import billing
import clipper
import db
import jobs
import publishing

clipper.load_env()
REQUIRED = ("API_KEY", "S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_BUCKET")


def require_api_key(credentials: HTTPAuthorizationCredentials = Depends(HTTPBearer())):
    # ponytail: one shared key until user accounts exist; then per-user tokens with scopes
    if not secrets.compare_digest(credentials.credentials.encode(), os.environ["API_KEY"].encode()):
        raise HTTPException(401, "invalid API key")


@asynccontextmanager
async def lifespan(_):
    if missing := [k for k in REQUIRED if not os.environ.get(k)]:
        raise RuntimeError(f"set {', '.join(missing)} in {clipper.HERE / '.env'}")
    db.migrate()
    yield


app = FastAPI(title="ClipperAI", lifespan=lifespan, dependencies=[Depends(require_api_key)])


@app.exception_handler(billing.LimitError)
def limit_reached(_, error: billing.LimitError):
    return JSONResponse({"detail": str(error)}, status_code=402)


@app.exception_handler(publishing.PublishError)
def cannot_publish(_, error: publishing.PublishError):
    return JSONResponse({"detail": str(error)}, status_code=error.status)


def found(project: dict | None) -> dict:
    if project is None:
        raise HTTPException(404, "project not found")
    return project


@app.post("/api/uploads", status_code=201)
def create_upload(request: jobs.NewUpload):
    billing.check_new_project()  # before the file is sent, not after
    return jobs.create_upload(request)


@app.post("/api/projects", status_code=202)
def create_project(request: jobs.NewProject):
    return jobs.create_project(request)


@app.get("/api/projects")
def list_projects(limit: int = 50):
    return jobs.list_projects(min(max(limit, 1), 200))


@app.get("/api/projects/{project_id}")
def get_project(project_id: UUID):
    return found(jobs.get_project(project_id))


@app.post("/api/projects/{project_id}/cancel")
def cancel_project(project_id: UUID):
    if project := jobs.cancel_project(project_id):
        return project
    found(jobs.get_project(project_id))
    raise HTTPException(409, "project already finished")


@app.delete("/api/projects/{project_id}", status_code=204)
def delete_project(project_id: UUID):
    if not jobs.delete_project(project_id):
        if found(jobs.get_project(project_id))["status"] in jobs.RUNNING:
            raise HTTPException(409, "project is still processing: cancel it first")
        raise HTTPException(409, "some of this project's posts haven't gone out yet: unschedule them first")


@app.patch("/api/projects/{project_id}/clips/{idx}")
def update_clip(project_id: UUID, idx: int, edit: jobs.ClipEdit):
    if clip := jobs.update_clip(project_id, idx, edit):
        return clip
    raise HTTPException(404, "clip not found")


@app.get("/api/projects/{project_id}/package")
def download_package(project_id: UUID):
    if (package := jobs.content_package(project_id)) is None:
        found(jobs.get_project(project_id))
        raise HTTPException(409, "nothing to download: the project isn't finished, its files have expired,"
                                 " or every clip was rejected")
    return StreamingResponse(package, media_type="application/zip",
                             headers={"Content-Disposition": 'attachment; filename="content-package.zip"'})


@app.get("/api/publishing/channels")
def publishing_channels():
    return publishing.channels()


@app.post("/api/projects/{project_id}/clips/{idx}/publish", status_code=201)
def publish_clip(project_id: UUID, idx: int, request: publishing.Publish):
    if (published := publishing.publish(project_id, idx, request)) is None:
        raise HTTPException(404, "clip not found")
    return published


@app.post("/api/projects/{project_id}/calendar/plan")
def plan_calendar(project_id: UUID, request: publishing.Calendar):
    return found(publishing.plan(project_id, request))


@app.post("/api/projects/{project_id}/calendar", status_code=201)
def schedule_calendar(project_id: UUID, request: publishing.Calendar):
    return found(publishing.schedule(project_id, request))


@app.get("/api/projects/{project_id}/publications")
def list_publications(project_id: UUID):
    return found(publishing.publications(project_id))


@app.delete("/api/publications/{publication_id}", status_code=204)
def remove_publication(publication_id: UUID):
    if publishing.remove(publication_id) is None:
        raise HTTPException(404, "post not found")


@app.get("/api/billing")
def billing_summary():
    return billing.summary()


@app.post("/api/billing/subscribe", status_code=201)
def subscribe(request: billing.Subscribe):
    return billing.subscribe(request.plan)


@app.post("/api/billing/cancel")
def cancel_plan():
    if subscription := billing.cancel():
        return subscription
    raise HTTPException(409, "there's no plan to cancel")
