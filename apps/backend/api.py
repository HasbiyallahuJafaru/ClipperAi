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
from contextlib import asynccontextmanager
from typing import Annotated
from uuid import UUID

from clerk_backend_api.security import authenticate_request
from clerk_backend_api.security.types import AuthenticateRequestOptions
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse

import billing
import clipper
import db
import jobs
import publishing

clipper.load_env()
REQUIRED = ("CLERK_SECRET_KEY", "S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_BUCKET")


def signed_in(request: Request) -> str:
    """The owner a request acts for: the Clerk organization active in the session, else the Clerk user. 401 unless
    the bearer token is a valid Clerk session token issued to one of this deployment's sites."""
    state = authenticate_request(request, AuthenticateRequestOptions(
        secret_key=os.environ["CLERK_SECRET_KEY"], accepts_token=["session_token"],
        authorized_parties=os.environ.get("CLERK_AUTHORIZED_PARTIES", "http://127.0.0.1:3000,http://localhost:3000").split(",")))
    if not state.is_signed_in:
        raise HTTPException(401, "Sign in to continue.")
    return state.payload.get("org_id") or state.payload["sub"]


Owner = Annotated[str, Depends(signed_in)]


@asynccontextmanager
async def lifespan(_):
    if missing := [k for k in REQUIRED if not os.environ.get(k)]:
        raise RuntimeError(f"set {', '.join(missing)} in {clipper.HERE / '.env'}")
    db.migrate()
    yield


app = FastAPI(title="ClipperAI", lifespan=lifespan)


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
def create_upload(owner: Owner, request: jobs.NewUpload):
    billing.check_new_project(owner)  # before the file is sent, not after
    return jobs.create_upload(request)


@app.post("/api/projects", status_code=202)
def create_project(owner: Owner, request: jobs.NewProject):
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


@app.post("/api/billing/subscribe", status_code=201)
def subscribe(owner: Owner, request: billing.Subscribe):
    return billing.subscribe(owner, request.plan)


@app.post("/api/billing/cancel")
def cancel_plan(owner: Owner):
    if subscription := billing.cancel(owner):
        return subscription
    raise HTTPException(409, "there's no plan to cancel")
