"""Run the whole backend locally in one process, without Cloudflare: API on http://127.0.0.1:8000, one worker,
the local dev Postgres, and a fake in-memory S3 (moto) on :9000 standing in for R2. Stored clips vanish on exit.

usage: python dev.py [--fake-buffer]        (needs: pip install pgserver "moto[server]")
--fake-buffer publishes to an in-memory Buffer with demo channels (fake_buffer.py) instead of your Buffer account.
For real R2, run `python jobs.py` and `python -m uvicorn api:app` separately; they use the S3_* settings in .env.
"""
import json
import os
import sys
import threading

import boto3
import uvicorn
from moto.server import ThreadedMotoServer

import clipper

S3 = "http://127.0.0.1:9000"

if __name__ == "__main__":
    # set before load_env(): .env only fills in what's missing, so these override its R2 settings for this process
    os.environ |= {"S3_ENDPOINT": S3, "S3_ACCESS_KEY_ID": "dev", "S3_SECRET_ACCESS_KEY": "dev", "S3_BUCKET": "dev",
                   "S3_PUBLIC_BUCKET": "dev-public", "S3_PUBLIC_URL": f"{S3}/dev-public"}
    fake_buffer = "--fake-buffer" in sys.argv[1:]
    if fake_buffer:
        import fake_buffer as fake  # noqa: E402
        os.environ |= {"BUFFER_API_KEY": fake.KEY, "BUFFER_OWNERS": "*"}  # a pretend account anyone may post to
    clipper.load_env()
    if missing := [k for k in ("GROQ_API_KEY", "DEEPSEEK_API_KEY", "CLERK_SECRET_KEY") if not os.environ.get(k)]:
        sys.exit(f"missing {', '.join(missing)} in {clipper.HERE / '.env'}")

    ThreadedMotoServer(ip_address="127.0.0.1", port=9000, verbose=False).start()
    # moto only accepts a real region name when creating a bucket (R2 buckets are made in the dashboard instead)
    s3 = boto3.client("s3", endpoint_url=S3, region_name="us-east-1", aws_access_key_id="dev", aws_secret_access_key="dev")
    for name in ("dev", "dev-public"):
        s3.create_bucket(Bucket=name)
    s3.put_bucket_policy(Bucket="dev-public", Policy=json.dumps({"Statement": [  # stands in for R2's public access switch
        {"Effect": "Allow", "Principal": "*", "Action": "s3:GetObject", "Resource": "arn:aws:s3:::dev-public/*"}]}))

    import api  # noqa: E402  (imported once the environment is final)
    import jobs  # noqa: E402
    import publishing  # noqa: E402
    import storage  # noqa: E402

    if fake_buffer:
        publishing.API = fake.FakeBuffer().url
    storage.setup()
    threading.Thread(target=jobs.work, args=(int(os.environ.get("WORKER_CONCURRENCY", 1)),), daemon=True).start()
    uvicorn.run(api.app, host="127.0.0.1", port=8000)
