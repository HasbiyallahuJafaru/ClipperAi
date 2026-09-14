"""Object storage: Cloudflare R2 (or any S3-compatible bucket). Media only lives here temporarily; lifecycle rules
on the bucket delete it. Env: S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET.

usage: python storage.py setup   (once per bucket: lifecycle rules + CORS for browser uploads)
"""
import functools
import os
import sys
from pathlib import Path

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

UPLOAD_DAYS = 1  # uploaded source videos: deleted after processing, this is the backstop for abandoned uploads
CLIP_DAYS = 30  # rendered clips, captions, thumbnails
MAX_UPLOAD_BYTES = 5 * 1024**3  # R2's single PUT limit is 5 GiB
URL_SECONDS = 24 * 3600  # signed download links; R2 allows at most 7 days


@functools.cache
def client():
    return boto3.client(
        "s3", endpoint_url=os.environ["S3_ENDPOINT"], region_name="auto",
        aws_access_key_id=os.environ["S3_ACCESS_KEY_ID"], aws_secret_access_key=os.environ["S3_SECRET_ACCESS_KEY"],
        config=Config(signature_version="s3v4", retries={"max_attempts": 5, "mode": "standard"}))


def bucket() -> str:
    return os.environ["S3_BUCKET"]


def put(path: Path, key: str, content_type: str):
    client().upload_file(str(path), bucket(), key, ExtraArgs={"ContentType": content_type})  # multipart when large


def get(key: str, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    client().download_file(bucket(), key, str(path))


def size(key: str) -> int | None:
    try:
        return client().head_object(Bucket=bucket(), Key=key)["ContentLength"]
    except ClientError as e:
        if e.response["Error"]["Code"] in ("404", "NoSuchKey", "NotFound"):
            return None
        raise


def delete_prefix(prefix: str):
    for page in client().get_paginator("list_objects_v2").paginate(Bucket=bucket(), Prefix=prefix):
        if objects := [{"Key": o["Key"]} for o in page.get("Contents", [])]:
            client().delete_objects(Bucket=bucket(), Delete={"Objects": objects})


def download_url(key: str) -> str:
    return client().generate_presigned_url("get_object", Params={"Bucket": bucket(), "Key": key},
                                           ExpiresIn=URL_SECONDS)


def upload_url(key: str, content_type: str) -> str:
    """Signed PUT; the content type is part of the signature, so the client must send exactly that header."""
    return client().generate_presigned_url("put_object", Params={"Bucket": bucket(), "Key": key,
                                                                 "ContentType": content_type}, ExpiresIn=3600)


def setup():
    client().put_bucket_lifecycle_configuration(Bucket=bucket(), LifecycleConfiguration={"Rules": [
        {"ID": "uploads", "Status": "Enabled", "Filter": {"Prefix": "uploads/"},
         "Expiration": {"Days": UPLOAD_DAYS}, "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 1}},
        {"ID": "projects", "Status": "Enabled", "Filter": {"Prefix": "projects/"}, "Expiration": {"Days": CLIP_DAYS}},
    ]})
    # signed URLs are the access control, so any origin may use them (browser uploads + <video> playback)
    client().put_bucket_cors(Bucket=bucket(), CORSConfiguration={"CORSRules": [
        {"AllowedOrigins": ["*"], "AllowedMethods": ["GET", "HEAD", "PUT"], "AllowedHeaders": ["content-type"],
         "MaxAgeSeconds": 3600}]})


if __name__ == "__main__":
    import clipper
    clipper.load_env()
    if sys.argv[1:] != ["setup"]:
        sys.exit(__doc__)
    setup()
    print(f"bucket {bucket()}: uploads expire after {UPLOAD_DAYS} day, clips after {CLIP_DAYS} days, CORS set")
