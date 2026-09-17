"""Scratch: serves just the public downloader routes (no DB/Clerk/S3) for local website testing."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import api

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000"], allow_methods=["*"], allow_headers=["*"])
app.post("/api/tools/download")(api.tool_resolve)
app.get("/api/tools/download")(api.tool_stream)
app.get("/api/tools/download/status")(api.tool_status)
