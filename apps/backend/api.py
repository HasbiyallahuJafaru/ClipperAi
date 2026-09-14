"""REST API over the shared project services. Run from apps/backend:  uvicorn api:app --reload
Every route needs `Authorization: Bearer <API_KEY>` (API_KEY in .env). Processing happens in `python jobs.py`.

Upload flow: POST /api/uploads -> PUT the file to upload_url -> POST /api/projects {"source": "upload:<id>"}.
Files are served as signed storage links on each clip (video_url, captions_url, thumbnail_url)."""
import os
import secrets
from contextlib import asynccontextmanager
from uuid import UUID

from fastapi import Depends, FastAPI, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

import clipper
import db
import jobs

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


def found(project: dict | None) -> dict:
    if project is None:
        raise HTTPException(404, "project not found")
    return project


@app.post("/api/uploads", status_code=201)
def create_upload(request: jobs.NewUpload):
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
