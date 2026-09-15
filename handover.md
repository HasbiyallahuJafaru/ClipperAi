# Handover: accounts with Clerk built; next is the website redesign or Phase 8 (MCP with Clerk OAuth)

Updated 2026-09-15 at the end of build session 4. Phase 7 (content calendar) is pushed (`39d434c`, `0e897d1`).
After that this session produced a pricing and capacity report and **built accounts with Clerk** (sign-in/up,
protected pages, backend token checks, every project/plan/post owned by an account). **All of it is pushed to
`main`** (commit "Accounts with Clerk..."). Commit and push only when the user asks. Start the next chat with one of:

> Read `handover.md`, `.claude/CLAUDE.md` and `.claude/memory.md`, then redesign the website after the reference design
> I'll attach, using the impeccable and design-taste-frontend skills (modern premium SaaS).

> Read `handover.md`, `.claude/CLAUDE.md` and `.claude/memory.md`, then start Phase 8 (MCP with Clerk OAuth) using the
> ponytail skill.

### Requested, not started: website redesign (user, 2026-09-15)
The user shared a reference design (a "Relink" data-analytics SaaS landing page) and asked to adopt it for a **modern
premium SaaS website**, reviewing it critically, with the impeccable and design-taste-frontend skills. The request was
interrupted before any work; the image isn't in the repo, so ask the user to attach it again. What it shows: pill
navbar with a blue "Get Started" button; soft sky-and-cloud hero with a large centered headline, a blue and a dark pill
CTA and a laptop + phone dashboard mockup overlapping the fold; a "why" section of three feature cards with mini charts
(the middle one filled blue); three tool cards with small product visuals and CTAs; pricing cards with a monthly/yearly
toggle and a highlighted plan; an integrations hub diagram of app logos; FAQ with contact details beside an accordion;
a newsletter band on the sky background; a multi-column footer. Look: white and pale-grey surfaces, one vivid blue
accent, near-black text, large radii, soft shadows, clean sans-serif. **This replaces the current look** (minimal,
Montserrat headings, caption-yellow accent, "no gradients/card clutter" rule in CLAUDE.md): update that rule with the
user's direction when the redesign starts, and keep the clip-review, calendar and publishing screens usable.

`.claude/CLAUDE.md` = goal, channels, Clerk decision, rules, commands. `.claude/memory.md` = full build log, what was
verified, what's left, gotchas. `README.md` = how the product works, API reference, setup. `DECISIONS.md` =
dependencies and why. This file = where we stopped and what to do first.

---

## Where things stand

| Area | State |
|---|---|
| Phases 0–4: research, engine, jobs, storage | Done and tested. Real R2 checked live; a full project processed on real R2 not run yet (Avast) |
| Phase 5: website (`apps/website`) | Done: batch submit, live progress, clip review, Download all (ZIP), cancel / delete |
| Billing (early Phase 9) | Plans Creator $15 / Pro $39 / Business $99 with monthly limits, now **per account**. **Payments switched off (user decision)** |
| Phase 6: publishing (Buffer) | Done and working for real (YouTube "The Micro-Fix") |
| Phase 7: content calendar | Done and pushed; real Buffer: one post via the page + a 30-post batch (Buffer plan caps scheduled posts at 10) |
| **Accounts (Clerk)** | **Built, tested and pushed.** Sign-in/up in the header, private pages redirect to sign-in, backend verifies Clerk session tokens, data isolated per Clerk org/user. Development instance |
| Phase 8: MCP | **Next**, with Clerk OAuth |
| Phase 9 cost tracking + payments (when asked) · Phase 10 deploy + hardening | Not started |

**Ways to use the product: only the website and MCP.** Telegram bot and command-line tool are scrapped.
**Accounts: Clerk for everything it offers** (user decision 2026-09-15; details in CLAUDE.md).

GitHub: https://github.com/HasbiyallahuJafaru/ClipperAi (**public**), branch `main` (no branches; commit only when the
user asks). Last pushed commit: `0e897d1`.

### What this session added after Phase 7
- **Pricing & capacity report** (private artifact): https://claude.ai/code/artifact/40731d89-cffa-4ab6-b520-a6dd461435ff.
  Our cost ≈ $0.11 per hour of source video (measured); competitors charge $2.90–$14.70 per hour on monthly plans;
  proposed $12/6 h, $24/20 h, $59/60 h, free 60 min (not decided). OpusClip already has an MCP server. Launch blockers:
  Groq free plan (8 video-hours/day total), one Buffer account for everyone, YouTube blocks cloud IPs, ZIP through the
  API, r2.dev bucket.
- **Clerk accounts:** Clerk CLI 3.3 (logged in, app `app_3JMJIEqTu79eUjLFgFDsRzpNa7h` "Clipper ai"); `@clerk/nextjs` 7.9
  (`proxy.ts`, `ClerkProvider`, nav controls, sign-in/up pages, `/api` proxy forwards the session token);
  `clerk-backend-api` 7.0 (`api.signed_in`), `migrations/006_owners.sql`, owner argument on every `jobs`/`billing`/
  `publishing` service, `BUFFER_OWNERS` gate for the shared Buffer key; `test_jobs.py` isolation checks; `check.mjs`
  signed-out checks; `dev_fixture.py` Clerk test user + sign-in ticket; `walkthrough.mjs` signs in and passes end to end.
- **Security patch:** Next.js 16.3.2 → 16.3.5 (critical RCE advisories).

---

## What's left to build

1. **Phase 8, MCP server with Clerk OAuth (next).** Mounted in FastAPI at `/mcp` (official `mcp` SDK, Streamable HTTP).
   Assistants sign in with their ClipperAi account through Clerk; verify `oauth_token` with `clerk-backend-api`; owner
   from the token. Tools over the existing owner-scoped services: repurpose_video, get_project_status, list_projects,
   generate_content_package (needs a link, not a streamed ZIP), create_content_calendar (`publishing.plan`),
   schedule_content (`publishing.schedule`). Check Clerk's dynamic client registration for MCP clients first.
2. **Per-account publishing connection** (each account its own Buffer key, or a multi-customer posting API such as
   Upload-Post/Late/Ayrshare) before real users sign up; until then only `BUFFER_OWNERS` can publish.
3. **Phase 9:** per-job cost tracking; new price list (user decides); payments only when asked (ask about Clerk Billing).
4. **Phase 10:** Railway deploy (API, worker, website, Postgres; Clerk production instance + domain), launch blockers
   from the report, missing §46 tests.
5. **Smaller:** Buffer 10-scheduled-post cap handling, brand settings page, real video titles, hook re-render, Clerk
   components in dark mode.

---

## Run and check it locally

```bash
cd apps/backend
export PATH="$PATH:/c/Users/USER/AppData/Local/Microsoft/WinGet/Links"   # ffmpeg in Bash tool shells
.venv/Scripts/python test_clipper.py && .venv/Scripts/python test_jobs.py  # both print ok
.venv/Scripts/python dev.py --fake-buffer   # API :8000 + worker + fake S3 :9000 + fake Buffer (BUFFER_OWNERS=*)

cd apps/website
export NODE_EXTRA_CA_CERTS=C:/Users/USER/.certs/ca-bundle-with-windows-roots.pem   # this PC: npm AND the Next server
npm run build && npm run start         # http://localhost:3000 (binds localhost; 127.0.0.1 breaks proxy.ts)
node check.mjs                         # signed-out checks
clerk doctor                           # Clerk integration health
cd ../backend && .venv/Scripts/python dev_fixture.py            # -> <project id> <media folder> <sign-in ticket>
cd ../website && node walkthrough.mjs <project id> <media folder> <sign-in ticket>   # every flow, signed in
```

Backend `.env` now has `CLERK_SECRET_KEY` and `SSL_CERT_FILE` (this PC); `API_KEY` is no longer used. For real R2 +
Buffer run `python -m uvicorn api:app --port 8000` and `python jobs.py` separately (`dev.py` always uses fake S3).
The local dev database has no plans and the 4 old projects, which have no owner (nobody sees them). The Clerk test
user `walkthrough+clerk_test@example.com` exists in the development instance and is reused by the fixture.

---

## Environment gotchas on this PC (details in memory.md)

- **Avast Web Shield** re-signs HTTPS: npm and **the Next server** need `NODE_EXTRA_CA_CERTS` (else Clerk sessions look
  signed out), boto3 needs `AWS_CA_BUNDLE`, Clerk's Python SDK needs `SSL_CERT_FILE` (else it hangs silently). Local
  HTTP downloads over ~1–2 MB stall and yt-dlp HTTPS fails: test with small files until Avast exceptions exist.
- Site address is **http://localhost:3000**. After stopping `npm run start`, kill whatever listens on :3000 before
  restarting.
- Clerk development instances bounce browser page loads through a handshake (307) once; Clerk's sign-in form takes a
  few seconds to load here.
- **pgserver's Postgres has no time zone files**: keep time zone math in Python.
- **Buffer:** 100 API requests per 15 minutes and 10 scheduled posts on this plan. Never post publicly without the
  user's go-ahead. Never print or commit values from `apps/backend/.env` or `apps/website/.env.local`.
- **Claude Code's permission check** blocks commands that create real Buffer posts (and then related commands). Don't
  work around it: report what's half-done and give the user the command (`! <command>`).

---

## Open items waiting on the user

- **Sign up as the first real user** at http://localhost:3000 (servers must be running). If a "Configure your
  application" callout appears, click it. Then give me your Clerk user id (or let me read it with `clerk users list`)
  to put in `BUFFER_OWNERS` so your account can publish, and say whether the 4 old projects should become yours.
- **Website redesign:** attach the reference design again when starting (see "Requested, not started" above).
- **Pricing:** accept, change or reject the proposed price list (report link above).
- **Buffer's 10-scheduled-post cap:** upgrade Buffer or have the calendar handle it.
- **Rotate the R2 token** (its values were pasted into the chat); scope it to `clipperai` and `clipperai-published`.
- **Delete the three Phase 6 test videos** on The Micro-Fix (watch?v=NbWBjHIFG2M, watch?v=VHLmTNy7Ex8, private uVqdDp9WFvc).
- **Old CLI folders** `apps/backend/out/` (30 MB) and `work/` (185 MB): delete when no longer wanted.
- **Instagram:** switch @theprimefactor to a creator/business account and reconnect it in Buffer.
- Custom domain for the public bucket, Avast exceptions, code license, Groq paid plan before real customers.
