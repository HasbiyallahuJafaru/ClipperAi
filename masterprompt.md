# MASTER BUILD PROMPT
## AI Video Content Repurposing, Clipping, Scheduling & MCP Platform

You are building a production-oriented SaaS application that turns long-form video into large quantities of polished, short-form, platform-ready content.

The core product principle is:

> **One long-form video → many high-quality short-form videos → captions, hooks, titles and descriptions → content calendar → automated publishing.**

The product should be fast, cost-efficient, highly automated, visually minimal and premium.

Do NOT unnecessarily build technology from scratch. The project should aggressively reuse mature, proven open-source software and APIs where legally and technically appropriate.

The goal is to combine the best existing components into one coherent product.

---

# 1. PRODUCT VISION

Build an AI-powered video repurposing platform.

A user should be able to provide:

1. A supported video URL
2. An uploaded video
3. Eventually, a connected storage source such as Google Drive, Dropbox or OneDrive

The system should then:

1. Acquire the source video.
2. Extract or obtain an existing transcript when possible.
3. Fall back to speech-to-text when necessary.
4. Analyze the transcript.
5. Identify the strongest moments.
6. Select approximately 10–30 potential clips depending on source length and user plan.
7. Create actual video clips using deterministic video-processing tools.
8. Automatically reframe horizontal video into vertical 9:16 format.
9. Track the relevant speaker/subject where possible.
10. Generate captions/subtitles.
11. Generate hooks.
12. Generate titles.
13. Generate descriptions.
14. Generate platform-specific copy.
15. Generate thumbnails or cover frames where appropriate.
16. Allow the user to preview and approve the results.
17. Create a content calendar.
18. Allow publishing through a third-party publishing provider such as Buffer.
19. Expose the same functionality through MCP so an AI assistant can operate the platform programmatically.

The product should eventually allow a user to say something equivalent to:

> "Take my latest two-hour podcast, find the 15 strongest moments, turn them into vertical clips, add captions, write platform-specific descriptions and schedule them across the next three weeks."

The system should handle the workflow automatically.

---

# 2. IMPORTANT DEVELOPMENT PHILOSOPHY

Do NOT approach this as a traditional greenfield application where every component is written from scratch.

The project should use a:

> **Research → Evaluate → Integrate → Test → Replace if necessary**

development methodology.

Before implementing major functionality, investigate existing mature open-source projects on GitHub.

Look specifically for existing solutions for:

- YouTube/video acquisition
- transcript extraction
- speech-to-text
- speaker diarization
- silence detection
- scene detection
- clip detection
- viral moment detection
- face detection
- person detection
- subject tracking
- smart video cropping
- 9:16 reframing
- subtitle generation
- animated captions
- FFmpeg processing
- thumbnail extraction
- video metadata extraction
- video quality analysis
- job queues
- media processing pipelines
- social publishing
- content scheduling

Prefer mature projects with:

- permissive licenses
- active maintenance
- strong documentation
- good community adoption
- production usage
- Python compatibility
- Docker compatibility
- clean APIs
- test coverage
- reasonable resource requirements

Do not blindly copy source code.

Prefer using a project as a dependency or service.

If source code must be adapted, verify its license first.

Do not introduce GPL/AGPL/copyleft code into a proprietary SaaS without explicitly evaluating the licensing consequences.

Every external dependency must be documented.

Create a dependency/license inventory.

---

# 3. CORE PRODUCT PRINCIPLE

Use AI for decisions.

Use deterministic software for execution.

For example:

AI:

> "The strongest moment is 12:34–13:18."

FFmpeg:

> "Cut 12:34–13:18."

AI:

> "The speaker is the visual focus."

Computer vision:

> "The speaker's face is located here."

FFmpeg:

> "Create the 9:16 crop."

AI:

> "Emphasize these words."

Subtitle renderer:

> "Render the captions."

Do not use expensive generative video models for operations that FFmpeg/OpenCV can perform.

The core product is NOT an AI video generation platform.

It is an AI-powered media processing and content repurposing platform.

---

# 4. TARGET STACK

## Frontend

Use:

- Next.js
- React
- TypeScript
- Tailwind CSS

Deploy frontend to:

- Vercel or Netlify

The UI should be extremely clean and minimal.

Avoid:

- unnecessary dashboards
- excessive cards
- gradients
- generic AI SaaS visual patterns
- clutter
- excessive animations
- overly complicated settings

The user should understand the main workflow immediately.

---

# 5. BACKEND

Use:

- Python
- FastAPI

Deploy backend initially on:

- Railway

The backend must be modular.

Do not put business logic directly inside API route handlers.

Use layers similar to:

```text
API
 ↓
Application Services
 ↓
Domain Logic
 ↓
Provider Interfaces
 ↓
External Providers / Infrastructure
```

The same application services must be usable by:

- Next.js API requests
- MCP tools
- background workers
- future API clients

Do not duplicate business logic between REST and MCP.

---

# 6. DATABASE

Use PostgreSQL.

Initially avoid Redis unless there is a demonstrated need.

Use PostgreSQL for:

- users
- projects
- source videos
- transcripts
- clips
- jobs
- publishing accounts
- scheduled posts
- usage
- provider configurations
- content calendars
- audit information

Possible schema:

```text
users
projects
source_videos
transcripts
transcript_segments
content_analyses
clip_candidates
clips
render_jobs
storage_objects
publishing_accounts
social_posts
content_calendar
usage_records
provider_usage
mcp_connections
```

Use migrations.

Do not rely on manually created production tables.

---

# 7. STORAGE PHILOSOPHY

Do NOT use Railway's filesystem as permanent media storage.

Use temporary object storage such as:

- Cloudflare R2
- S3-compatible storage

Prefer Cloudflare R2 initially because of its useful egress economics.

The application should not permanently store users' large source videos unless explicitly required.

Implement lifecycle management.

Example:

```text
SOURCE VIDEO
↓
Temporary storage
↓
Processing
↓
Final clips
↓
Publishing/export
↓
Automatic cleanup
```

Metadata such as:

- transcript
- timestamps
- clip metadata
- publishing information

can remain in PostgreSQL.

Eventually support user-owned storage:

- Google Drive
- Dropbox
- OneDrive
- Amazon S3
- Cloudflare R2

However, user-owned storage should initially be optional.

The simplest experience should remain:

> Paste a URL → Process.

---

# 8. VIDEO ACQUISITION

Research mature existing implementations before building a downloader.

For supported public sources, consider yt-dlp or another mature implementation where legally and technically appropriate.

Important:

Do not design the system to bypass DRM, authentication restrictions or platform download restrictions.

Support user-owned or otherwise legally downloadable content.

The acquisition layer should expose a clean interface:

```python
class VideoSourceProvider:
    async def inspect(source: str): ...
    async def acquire(source: str): ...
    async def metadata(source: str): ...
```

The rest of the application should not care whether the source came from:

- YouTube
- direct URL
- uploaded file
- Google Drive
- Dropbox
- another supported provider

---

# 9. TRANSCRIPTION STRATEGY

Use a transcription waterfall.

Do not automatically pay for transcription if a reliable transcript already exists.

Pipeline:

```text
Source
 ↓
Check for usable existing transcript/captions
 ↓
If available → use transcript
 ↓
Otherwise → Grok STT
 ↓
Optional future fallback → local Whisper/other STT
```

Current preferred API transcription provider:

Grok/xAI Speech-to-Text.

Do not assume the consumer Grok product being free means the API is free.

Use the official API pricing at implementation time.

The transcript must preserve:

- timestamps
- word timestamps where available
- speaker information where available
- language
- confidence where available

Store the transcript.

Never transcribe the same video unnecessarily.

Use content hashing where possible.

Example:

```text
video hash
↓
already processed?
↓
reuse transcript
```

---

# 10. TRANSCRIPT REPRESENTATION

Represent transcript segments structurally.

Example:

```json
{
  "start": 734.20,
  "end": 748.60,
  "speaker": "speaker_1",
  "text": "Most companies make the same mistake..."
}
```

Where word-level timestamps exist, retain them.

This is important for:

- accurate clip boundaries
- captions
- word highlighting
- animated subtitles
- speaker analysis

---

# 11. CONTENT ANALYSIS

Use an LLM such as DeepSeek for transcript understanding.

Do NOT send the entire video to the LLM.

The LLM should primarily reason over:

- transcript
- timestamps
- speaker information
- metadata
- optionally precomputed video signals

The LLM should identify candidate moments based on factors such as:

- strong opening
- complete thought
- emotional intensity
- useful insight
- controversy
- novelty
- humor
- surprising information
- storytelling
- practical advice
- strong opinion
- question/answer
- audience relevance
- standalone context

Avoid simply choosing the loudest or most dramatic sentence.

A good clip should make sense when removed from the original video.

---

# 12. TWO-PASS CLIP SELECTION

For long videos, use a two-stage analysis system.

Pass 1:

Cheap/efficient model or preprocessing identifies many candidate sections.

Example:

```text
2-hour transcript
↓
50 candidate moments
```

Pass 2:

Stronger reasoning selects the best candidates.

Example:

```text
50 candidates
↓
rank
↓
15 final clips
```

This reduces LLM cost.

---

# 13. CLIP JSON SCHEMA

The AI should return structured JSON rather than free-form prose.

Example:

```json
{
  "clips": [
    {
      "start": 734.2,
      "end": 781.6,
      "score": 94,
      "reason": "Strong standalone insight with a clear payoff",
      "hook": "Most companies make this mistake...",
      "title": "The Mistake Most Companies Make",
      "platforms": ["tiktok", "instagram", "youtube"],
      "caption_segments": [
        {
          "start": 734.2,
          "end": 738.4,
          "text": "Most companies make this mistake"
        }
      ]
    }
  ]
}
```

Validate the response against a schema.

Never trust raw model output.

If parsing fails:

1. retry
2. repair if safe
3. reject invalid output
4. log the failure

---

# 14. CLIP BOUNDARIES

Do not blindly cut at arbitrary timestamps.

Use transcript sentence boundaries and word timestamps.

The clip should generally:

- begin naturally
- contain a complete thought
- avoid cutting words
- avoid unnecessary silence
- avoid beginning halfway through a sentence
- end after the payoff

Allow configurable clip lengths.

Examples:

- 15–30 seconds
- 30–60 seconds
- 60–90 seconds

Default to approximately 30–60 seconds for short-form social content.

---

# 15. VIDEO PROCESSING

Use FFmpeg as the primary deterministic video-processing engine.

Use it for:

- cutting
- scaling
- cropping
- audio normalization
- subtitle rendering
- format conversion
- thumbnail extraction
- concatenation
- encoding

Do not create custom video-processing algorithms unless necessary.

Research mature FFmpeg wrappers or existing projects where useful.

---

# 16. SMART 9:16 REFRAMING

This is a major product feature.

For a 16:9 video:

```text
16:9
 ↓
detect subject/speaker
 ↓
track subject
 ↓
calculate vertical crop
 ↓
render 9:16
```

Use existing mature computer vision technology where possible.

Potential components include:

- OpenCV
- MediaPipe
- existing face/person trackers
- other permissively licensed tracking projects

The crop should intelligently follow the speaker.

For multiple speakers:

- determine active speaker where possible
- otherwise use a balanced crop
- avoid excessive camera movement
- avoid jumping crops

Allow fallback to center crop.

---

# 17. CAPTIONS

Generate accurate captions from the actual transcript.

Do not ask an LLM to invent what was said.

Source of truth:

```text
Grok/YouTube transcript
```

LLM may determine:

- segmentation
- emphasis
- styling
- hook presentation

But spoken text must come from the actual transcript.

Support:

- word-level timing
- highlighted words
- configurable font
- configurable position
- safe margins
- readable contrast
- optional animated captions

Use deterministic subtitle rendering.

---

# 18. BRANDING

Allow users to define:

- brand name
- logo
- primary color
- secondary color
- font
- caption style
- caption position
- watermark
- intro/outro preferences

However, do not make branding mandatory.

The default output should already look polished.

---

# 19. CONTENT GENERATION

For every approved clip, optionally generate:

- hook
- title
- short caption
- long caption
- description
- hashtags
- CTA
- platform-specific copy

Adapt copy by platform.

For example:

```text
TikTok
Instagram Reels
YouTube Shorts
LinkedIn
Facebook
X
```

Do not blindly use identical text on every platform.

---

# 20. THUMBNAILS / COVER IMAGES

Extract useful frames from the video.

Optionally use AI/image tooling later for generated thumbnails.

Do not introduce expensive image generation into the MVP unless it materially improves the product.

A strong extracted frame + typography is sufficient initially.

---

# 21. CONTENT CALENDAR

After clips are created, allow users to create a publishing schedule.

Example:

```text
Monday → Clip 01
Wednesday → Clip 02
Friday → Clip 03
Monday → Clip 04
...
```

Allow:

- frequency
- posting days
- posting times
- start date
- platform selection

The system should be able to automatically distribute content across a period.

---

# 22. SOCIAL PUBLISHING

Do NOT initially build direct integrations with every social network.

Use a publishing provider such as Buffer.

Architecture:

```text
Our Application
      ↓
PublishingProvider interface
      ↓
Buffer implementation
      ↓
Social platforms
```

Keep the interface abstract so Buffer can later be replaced.

Potential interface:

```python
class PublishingProvider:

    async def connect_account():
        ...

    async def get_channels():
        ...

    async def create_post():
        ...

    async def schedule_post():
        ...

    async def publish_now():
        ...

    async def get_post_status():
        ...
```

Users should connect their own publishing account.

Do not ask users for social media passwords.

Use OAuth.

---

# 23. USER-OWNED STORAGE

Eventually support:

```text
Connect Google Drive
Connect Dropbox
Connect OneDrive
Connect S3
Connect R2
```

But this is not required for the first MVP.

The UX should not force users to configure storage before experiencing the product.

---

# 24. MCP INTEGRATION

Implement an MCP server using the official Python MCP SDK.

Use:

**Streamable HTTP**

for the deployed server.

Example:

```text
https://api.yourdomain.com/mcp
```

Do not create a separate application/business-logic system for MCP.

MCP calls the same services used by the web UI.

Architecture:

```text
Next.js
   │
   ▼
FastAPI REST/API
   │
   ▼
Shared application services
   ▲
   │
MCP server
   ▲
   │
Claude / AI client
```

---

# 25. MCP TOOLS

Prefer high-level tools.

Potential tools:

```text
analyze_video
find_best_clips
create_clip
create_clip_batch
repurpose_video
generate_content_package
create_content_calendar
schedule_content
get_project_status
get_clip_status
list_projects
```

Do not expose dozens of low-level FFmpeg operations to the AI.

The AI should be able to say:

```text
repurpose_video(...)
```

and the backend handles:

```text
download
transcription
analysis
clip selection
rendering
captions
metadata
packaging
```

internally.

---

# 26. MCP AUTHENTICATION

Never expose MCP anonymously.

Use authenticated access.

Associate MCP credentials with:

- user
- workspace
- permissions
- subscription
- usage limits

Implement:

- bearer tokens or appropriate OAuth
- token rotation
- expiration where appropriate
- rate limiting
- audit logging

Never expose provider API keys to the MCP client.

---

# 27. LONG-RUNNING JOBS

Never make an MCP or HTTP request wait for a long video processing task.

Example:

```text
create_content_package()
        ↓
returns job_id
        ↓
background processing
        ↓
get_job_status(job_id)
```

Job states:

```text
queued
downloading
extracting
transcribing
analyzing
selecting_clips
rendering
captioning
packaging
publishing
completed
failed
cancelled
```

Store job state in PostgreSQL.

---

# 28. WORKER ARCHITECTURE

Initially:

```text
FastAPI
   ↓
PostgreSQL jobs
   ↓
worker
   ↓
FFmpeg / AI providers
```

Use controlled concurrency.

Do not allow unlimited FFmpeg processes.

Concurrency should depend on:

- server CPU
- RAM
- subscription
- job type
- system load

Eventually introduce Redis or another queue only when required.

---

# 29. COST CONTROL

The system must be designed around minimizing cost.

Rules:

### Rule 1

Do not use AI when deterministic software can solve the problem.

### Rule 2

Do not process the same video twice.

### Rule 3

Cache transcripts.

### Rule 4

Cache analyses.

### Rule 5

Use the cheapest acceptable AI model.

### Rule 6

Use stronger models only when necessary.

### Rule 7

Delete temporary media automatically.

### Rule 8

Do not permanently store source videos by default.

### Rule 9

Control worker concurrency.

### Rule 10

Track actual per-user processing costs.

---

# 30. PROVIDER ABSTRACTION

Never hardcode the application around one AI provider.

Create interfaces.

Example:

```text
providers/
    transcription/
        base.py
        grok.py
        youtube.py
        whisper.py

    llm/
        base.py
        deepseek.py

    storage/
        base.py
        r2.py
        s3.py

    publishing/
        base.py
        buffer.py
```

The application should depend on interfaces, not providers.

This allows future replacement.

---

# 31. COST ROUTER

Eventually implement a provider-selection layer.

Example:

```text
Transcription request
        ↓
Is existing transcript available?
        ↓
YES → use it
NO
 ↓
Grok STT
 ↓
fallback if unavailable
```

Similarly:

```text
LLM request
 ↓
Can cheap model handle it?
 ↓
YES → cheap model
NO → stronger model
```

The system should optimize:

```text
cost
+
quality
+
latency
+
availability
```

rather than optimizing only for price.

---

# 32. USAGE LIMITS

Every account should have usage limits.

Track:

- source video minutes
- transcription minutes
- rendered minutes
- clips generated
- storage usage
- AI tokens
- publishing operations
- concurrent jobs

Do not use "unlimited" plans initially.

Possible initial plans:

### Free

- 1 source video/month
- up to 30 minutes
- 3 clips
- watermark
- manual export

### Creator — approximately $19/month

- up to 5 source videos
- approximately 5 hours processing
- approximately 50 clips
- no watermark
- captions
- smart reframing
- content calendar

### Pro — approximately $39/month

- up to 15 source videos
- approximately 15 hours processing
- approximately 150 clips
- MCP
- automated publishing
- Buffer integration
- batch processing
- platform-specific content

### Business — approximately $99/month

- approximately 50 processing hours
- approximately 500 clips
- teams/workspaces
- brand presets
- MCP
- automated publishing
- API access
- higher concurrency

These numbers are starting assumptions, not fixed requirements.

Pricing should eventually be adjusted using real infrastructure cost data.

---

# 33. COST OBSERVABILITY

Implement internal cost tracking.

For every job record:

```text
user_id
project_id
source_duration
transcription_seconds
transcription_cost
llm_input_tokens
llm_output_tokens
llm_cost
render_seconds
storage_bytes
storage_duration
publishing_operations
estimated_total_cost
```

This allows the business owner to answer:

> How much did this customer actually cost us?

This is mandatory before scaling.

---

# 34. USER EXPERIENCE

The product should feel extremely simple.

Main screen:

```text
Turn one video into weeks of content.

[ Paste video URL ]

or

[ Upload video ]

[ Connect storage ]
```

After processing:

```text
18 clips found

[ Preview all ]

Clip 01
Clip 02
Clip 03
...
```

Then:

```text
[ Download ]
[ Schedule ]
[ Publish ]
```

Do not expose technical complexity.

---

# 35. PROCESSING UX

Show meaningful human-readable states.

Instead of:

```text
worker_3: rendering
```

show:

```text
Finding your strongest moments...
```

Then:

```text
Creating 18 clips...
```

Then:

```text
Adding captions...
```

Then:

```text
Preparing your content calendar...
```

Then:

```text
Ready.
```

Allow users to leave the page while processing continues.

---

# 36. FAILURE HANDLING

Every external operation can fail.

Handle:

- network failures
- API rate limits
- provider outages
- invalid videos
- unsupported formats
- transcription failure
- malformed LLM output
- FFmpeg failure
- storage failure
- publishing failure

Implement retries with exponential backoff where appropriate.

Do not retry permanent errors indefinitely.

Every job must eventually become:

```text
completed
failed
cancelled
```

Never leave jobs stuck in "processing" forever.

---

# 37. SECURITY

Implement:

- environment variables for secrets
- no API keys in frontend
- authentication
- authorization
- per-user data isolation
- signed storage URLs
- input validation
- URL validation
- upload limits
- MIME validation
- file-size limits
- command injection protection
- safe FFmpeg argument construction
- rate limiting
- CSRF protection where applicable
- secure OAuth handling
- audit logs for sensitive actions

Never concatenate user-controlled strings directly into shell commands.

Use subprocess argument arrays.

---

# 38. API DESIGN

Use clean REST endpoints for the web application.

Examples:

```text
POST   /api/projects
POST   /api/projects/{id}/sources
POST   /api/projects/{id}/analyze
POST   /api/projects/{id}/clips
POST   /api/projects/{id}/render
GET    /api/projects/{id}/status
GET    /api/projects/{id}/clips
POST   /api/projects/{id}/publish
POST   /api/projects/{id}/schedule
GET    /api/projects/{id}/calendar
```

Do not expose internal provider details unnecessarily.

---

# 39. FRONTEND PAGES

Minimum:

```text
/
    Landing page

/dashboard
    Projects

/projects/new
    Create project

/projects/{id}
    Project processing/results

/projects/{id}/clips
    Clip library

/projects/{id}/calendar
    Content calendar

/settings
    Account/settings

/settings/integrations
    Buffer/storage integrations

/settings/brand
    Branding

/settings/usage
    Usage/cost limits
```

MCP configuration should eventually have its own settings section.

---

# 40. CLIP REVIEW UI

Each clip should show:

```text
Video preview

Title
Hook
Description

Duration
Score
Platform suggestions

[ Edit ]
[ Approve ]
[ Reject ]
```

Allow batch actions:

```text
Approve all
Render all
Schedule all
Download all
```

---

# 41. CONTENT CALENDAR UI

Use a simple calendar/list.

Example:

```text
MON  Sep 21
Instagram
TikTok
Clip 01

WED  Sep 23
YouTube Shorts
Clip 02

FRI  Sep 25
LinkedIn
Clip 03
```

Do not make the first version unnecessarily complex.

---

# 42. DOWNLOAD/PACKAGING

Users should be able to download:

- individual clips
- ZIP of all clips
- captions
- titles
- descriptions
- thumbnails

Optionally provide a complete content package:

```text
content-package.zip

/videos
/captions
/thumbnails
/metadata
/calendar.csv
```

---

# 43. BATCH PROCESSING

Batch processing is central to the product.

A user should be able to submit multiple source videos.

Example:

```text
Podcast 01
Podcast 02
Podcast 03
Podcast 04
```

The system processes them through the job pipeline.

Do not require the user to wait for one video before starting another.

---

# 44. FUTURE FEATURES

Do not implement these in the first MVP unless required.

Potential future capabilities:

- AI-generated B-roll
- image generation
- AI voiceover
- music generation
- automatic thumbnails
- direct publishing APIs
- analytics
- engagement feedback
- automatic clip performance learning
- content recommendation
- content gap analysis
- multi-language dubbing
- translation
- subtitle translation
- avatar generation
- brand voice
- agency workspaces
- team collaboration
- white-labeling

The architecture should make these possible later without forcing them into the MVP.

---

# 45. MVP PRIORITY ORDER

Build in this exact order unless technical evidence requires a change.

## Phase 0 — Research

Research existing GitHub projects.

Create:

```text
COMPONENT
PROJECT
LICENSE
ACTIVITY
QUALITY
DEPENDENCIES
RESOURCE REQUIREMENTS
INTEGRATION METHOD
DECISION
```

Do not write major implementation code until this audit is complete.

---

## Phase 1 — Processing prototype

Build a CLI/local pipeline:

```text
video URL
↓
acquire
↓
transcript
↓
analyze
↓
select 3 clips
↓
FFmpeg
↓
output
```

The goal is proving the engine.

---

## Phase 2 — Full clipping engine

Implement:

- transcript
- candidate detection
- clip ranking
- 10–30 clips
- smart boundaries
- vertical crop
- captions
- metadata

---

## Phase 3 — Job architecture

Implement:

- PostgreSQL jobs
- background workers
- retries
- status tracking
- concurrency limits

---

## Phase 4 — Storage

Implement:

- R2
- temporary media
- signed URLs
- lifecycle cleanup

---

## Phase 5 — Next.js UI

Build the premium user experience.

---

## Phase 6 — Publishing

Implement Buffer integration.

---

## Phase 7 — Content calendar

Add scheduling and batch publishing.

---

## Phase 8 — MCP

Expose high-level tools through Streamable HTTP.

---

## Phase 9 — Billing and usage

Implement:

- plans
- limits
- usage tracking
- cost monitoring
- overage handling

---

## Phase 10 — Production hardening

Test:

- security
- concurrency
- failure recovery
- large videos
- long videos
- malformed files
- provider outages
- duplicate jobs
- cost limits
- storage cleanup

---

# 46. TESTING REQUIREMENTS

Every major component needs tests.

Test:

### Acquisition

- valid URL
- invalid URL
- unsupported URL
- unavailable video

### Transcription

- existing transcript
- Grok fallback
- long audio
- multilingual audio
- no speech

### Analysis

- malformed JSON
- empty transcript
- extremely long transcript
- ambiguous clips

### Rendering

- 16:9
- 9:16
- 4:3
- multiple speakers
- no detectable face
- subtitles
- audio

### Jobs

- retries
- cancellation
- duplicate jobs
- worker crash
- provider timeout

### Publishing

- OAuth failure
- expired token
- rate limits
- publishing failure
- scheduled post

---

# 47. ACCEPTANCE CRITERIA FOR MVP

The MVP is not complete until this workflow works:

```text
User
 ↓
pastes a supported video URL
 ↓
system acquires video
 ↓
system obtains transcript
 ↓
system analyzes transcript
 ↓
system finds strong moments
 ↓
system creates at least 10 useful clips
 ↓
clips are vertical 9:16
 ↓
speaker is reasonably framed
 ↓
captions are synchronized
 ↓
titles/hooks/descriptions are generated
 ↓
user previews clips
 ↓
user approves clips
 ↓
user creates schedule
 ↓
system sends posts to publishing provider
 ↓
user sees publishing status
```

And this must also work:

```text
Claude / MCP client
 ↓
repurpose_video()
 ↓
job created
 ↓
processing
 ↓
status queried
 ↓
content package completed
```

---

# 48. DEFINITION OF "PREMIUM"

Premium does NOT mean:

- expensive infrastructure
- excessive animation
- complicated dashboards
- huge numbers of settings

Premium means:

- fast
- predictable
- clean
- accurate
- polished
- minimal
- reliable
- good defaults
- no unnecessary decisions
- excellent output

The user should not need to understand the underlying technology.

---

# 49. DEFINITION OF "COST EFFICIENT"

The system should prefer:

```text
existing transcript
        over
paid transcription

deterministic processing
        over
AI generation

cheap model
        over
expensive model

cached result
        over
reprocessing

temporary storage
        over
permanent storage

user-owned storage
        over
our permanent storage

third-party publishing infrastructure
        over
maintaining every social API ourselves
```

But never sacrifice reliability merely to save a few cents.

The target is:

> **Lowest sustainable cost while maintaining a premium user experience.**

---

# 50. IMPORTANT ENGINEERING RULES

Do not:

- rewrite mature open-source libraries unnecessarily
- duplicate business logic
- hardcode provider APIs throughout the application
- store large videos permanently by default
- use Railway filesystem as permanent storage
- expose API keys to the frontend
- make synchronous HTTP requests wait for long video jobs
- allow unlimited FFmpeg processes
- send full videos to LLMs unnecessarily
- use expensive generative AI for deterministic operations
- blindly trust LLM output
- blindly copy GitHub source code without checking licenses
- build every social network integration ourselves initially
- introduce Redis before we need it
- create unnecessary microservices
- over-engineer the MVP

Prefer a modular monolith initially.

---

# 51. TARGET ARCHITECTURE

The preferred initial architecture is:

```text
                    ┌─────────────────┐
                    │     Next.js     │
                    │    Frontend     │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │    FastAPI      │
                    │   Application   │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
          PostgreSQL       Workers         MCP
              │              │              │
              │              │              ▼
              │              │         AI Clients
              │              │
              │       ┌──────┼─────────┐
              │       │      │         │
              ▼       ▼      ▼         ▼
             Jobs    FFmpeg  Grok    DeepSeek
                      │
                      ▼
                  OpenCV/CV
                      │
                      ▼
                     R2
                      │
                      ▼
                   Buffer
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
       TikTok     Instagram    YouTube
```

Keep this architecture simple.

---

# 52. FIRST COMMAND TO THE CODING AGENT

Before writing application code, the coding agent must:

1. Inspect the repository.
2. Identify the current environment.
3. Create a project plan.
4. Research existing open-source implementations.
5. Produce a component evaluation table.
6. Identify licenses.
7. Identify which components should be dependencies versus custom code.
8. Identify API costs.
9. Identify infrastructure costs.
10. Propose the minimum viable architecture.
11. Wait for no unnecessary confirmation if the requirements are already clear.
12. Begin implementation in small verifiable stages.

Do not spend excessive time generating documentation instead of building.

---

# 53. AGENT WORKING STYLE

Work incrementally.

For every major feature:

```text
Plan
↓
Implement
↓
Test
↓
Run
↓
Inspect
↓
Fix
↓
Move to next feature
```

Do not implement the entire application blindly in one pass.

After every meaningful milestone:

- run tests
- run lint
- run type checks
- run the application
- verify actual behavior

Never claim functionality works without testing it.

---

# 54. FINAL PRODUCT PRINCIPLE

The final product should feel like:

> "I give this thing a video and it gives me a month of content."

The user should not need to understand:

- FFmpeg
- transcription APIs
- object storage
- LLMs
- queues
- workers
- MCP
- OAuth
- social APIs

Those are implementation details.

The product experience should be:

```text
GIVE VIDEO
     ↓
AI FINDS THE GOOD STUFF
     ↓
GET POLISHED CLIPS
     ↓
APPROVE
     ↓
SCHEDULE
     ↓
PUBLISH
```

The technical implementation should remain modular enough that any individual component can be replaced without rebuilding the entire product.

The product's competitive advantage is not owning every underlying technology.

The competitive advantage is **orchestrating existing technology into an exceptionally simple, fast and cost-efficient content production workflow.**