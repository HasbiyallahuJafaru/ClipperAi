# One image for both Railway services. API: the default command. Worker: set START_COMMAND="python jobs.py".
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
# ffmpeg (with libass) cuts and captions; nodejs is the JS runtime yt-dlp needs for YouTube
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg nodejs && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
# never run as root; jobs write their temporary media under /app/work and /app/tmp
RUN useradd --create-home app && mkdir -p work tmp && chown -R app /app
USER app
# Railway's proxy terminates HTTPS in front of the API
CMD ["sh", "-c", "${START_COMMAND:-uvicorn api:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips=*}"]
