# Handover: Phase 7 done, next is Phase 8 (MCP)

Updated 2026-09-15 at the end of build session 4. **Phase 7 (content calendar) is built and tested, including against
real Buffer. The Telegram bot and command-line tool were scrapped. Pushed to `main` as 39d434c.**
Commit and push only when the user asks. Start the next chat with:

> Read `handover.md`, `.claude/CLAUDE.md` and `.claude/memory.md`, then start Phase 8 (MCP) using the ponytail skill.

`.claude/CLAUDE.md` = goal, channels, rules, commands. `.claude/memory.md` = full build log, what was verified, what's
left, gotchas. `README.md` = how the product works, API reference, setup. `DECISIONS.md` = dependencies and why.
This file = where we stopped and what to do first.

---

## Where things stand

| Area | State |
|---|---|
| Phases 0–4: research, engine, jobs, storage | Done and tested. Real R2 checked live; a full project processed on real R2 not run yet (Avast) |
| Phase 5: website (`apps/website`) | Done, works locally: batch submit, live progress, clip review, Download all (ZIP), cancel / delete |
| Billing (early part of Phase 9) | Plans Creator $15 / Pro $39 / Business $99 with monthly limits. **Payments switched off (user decision).** One workspace, no sign-in |
| Phase 6: publishing (Buffer) | Done and working for real: post now, scheduled and unscheduled posts reached YouTube "The Micro-Fix" |
| Phase 7: content calendar | **Done, pushed (39d434c).** Local tests + walkthrough pass; against real Buffer: one post scheduled/unscheduled through the page, and a 30-post batch (worker fine, Buffer's plan cap refused 20) |
| Phase 8: MCP | **Next** |
| Phase 9: accounts, cost tracking, real payments · Phase 10: deploy + hardening | Not started |

**Ways to use the product: only the website and MCP** (user, 2026-09-15). The planned Telegram bot and the command-line
tool are scrapped: the CLI is removed from `clipper.py` (`run()` now requires `progress`, `load_transcript`,
`save_transcript`, `work_root`), Telegram was only ever a plan. The REST API is the website's backend, not a channel.

GitHub: https://github.com/HasbiyallahuJafaru/ClipperAi (**public**), branch `main` (no branches: commit straight to
`main`, only when the user asks). Last pushed commit: Phase 7 (39d434c).

### What this session added
- **Content calendar:** on a project's **Calendar** page (or "Schedule all" on the project page) the user picks
  channels, posting days, times and a start date. **Preview** shows which approved clip goes out when; **Schedule**
  queues one post per clip and channel and answers at once; the worker hands queued posts to Buffer one at a time
  (~3.4 s each for real), waiting a minute when Buffer can't be used. The page lists every post day by day with status
  and Unschedule. `calendar.csv` is in Download all.
- Rules chosen (the user can change them): every clip goes to all chosen channels at the same time; clips in clip
  order; times at least 30 minutes ahead and at most 30 days; times a chosen channel already has a post at are skipped
  (a second calendar continues after the first); clips that don't fit are listed, not scheduled.
- Files: `publishing.py` (`Calendar`, `slots`, `plan`, `schedule`, `send_queued`, `ready`), `jobs.py` (worker thread,
  `calendar.csv`), `api.py` (2 routes), `requirements.txt` (+ `tzdata`), `test_jobs.py`; website
  `app/projects/[id]/calendar/page.tsx`, `publish.tsx` (shared `ChannelChoices`, `PostList compact`), project page,
  `lib.ts`, `check.mjs`, `walkthrough.mjs`; `clipper.py` + `test_clipper.py` (CLI removed); README, DECISIONS, CLAUDE.md.

---

## What's left to build

1. **Phase 8, MCP server (next).** Spec: `masterprompt.md` §24–26, §47 (Claude → repurpose_video → status → content
   package). High-level tools over existing services: `repurpose_video` → `jobs.create_project`,
   `get_project_status` / `list_projects` → `jobs`, `generate_content_package` → a package link,
   `create_content_calendar` → `publishing.plan`, `schedule_content` → `publishing.schedule`. Same limits as the
   website (already enforced in those services). **Decide with the user first:** where it lives (default: mounted in
   the FastAPI backend) and what it authenticates with until accounts exist (only the shared `API_KEY` today; MCP is
   never anonymous).
2. **Phase 9, accounts.** Sign-in (replace the shared key; required before the website goes public), per-user MCP
   tokens created on the website, per-user cost tracking (§33). Real payments only when the user asks (confirm
   Pro/Business prices first).
3. **Phase 10, deploy + hardening.** Railway (separate API and worker, Postgres, image with ffmpeg + Node/Deno + fonts),
   the §46 tests still missing (long videos, other languages, no speech, 4:3 / 9:16 sources, several speakers, provider
   timeouts, duplicate jobs, malformed files, rate limits), YouTube blocking downloads from cloud servers, custom domain
   for the public bucket, Groq paid plan.
4. **Smaller improvements:** Buffer's 10-scheduled-post cap (stop a channel's queue after "Scheduled posts limit
   reached" and warn before scheduling more; or the user upgrades Buffer), brand settings page (§18/§39), real video
   titles in lists, re-render with an edited hook (§40), optional YouTube privacy choice, calendar across all projects.

Not yet proven on real services: a full project processed end to end on real R2 (Avast blocks it on this PC),
Instagram posting (needs a creator/business account), recovery from a real Buffer 429 (blocked by the permission
check), a person using the site in a normal browser.

---

## Run and check it locally

```bash
cd apps/backend
export PATH="$PATH:/c/Users/USER/AppData/Local/Microsoft/WinGet/Links"   # ffmpeg in Bash tool shells
.venv/Scripts/python test_clipper.py && .venv/Scripts/python test_jobs.py  # both print ok
.venv/Scripts/python dev.py --fake-buffer   # API :8000 + worker (projects + calendar posts) + fake S3 :9000 + fake Buffer

cd apps/website
npm run build && npm run start         # http://127.0.0.1:3000 (.env.local exists on this PC). Choose a plan first (free)
node check.mjs                         # proxy checks, no paid calls
cd ../backend && .venv/Scripts/python dev_fixture.py            # -> <project id> <media folder>
cd ../website && node walkthrough.mjs <project id> <media folder>   # every flow incl. publishing + calendar
```

For real R2 + Buffer run `python -m uvicorn api:app --port 8000` and `python jobs.py` separately (`dev.py` always uses
fake S3). The local dev database has **no plan** and the 4 old projects; Buffer has **0 waiting posts**; the public
bucket is empty (all test data from this session was removed).

---

## Environment gotchas on this PC (details in memory.md)

- **Avast Web Shield** breaks real end-to-end runs: local HTTP downloads over ~1–2 MB stall, yt-dlp HTTPS fails with
  `CERTIFICATE_VERIFY_FAILED`. Not a code bug. Test with small files until the user adds exceptions.
- npm needs `NODE_EXTRA_CA_CERTS=C:/Users/USER/.certs/ca-bundle-with-windows-roots.pem`; boto3 uses `AWS_CA_BUNDLE`.
- **pgserver's Postgres here has no time zone files**: keep time zone math in Python (`zoneinfo`), not SQL.
- Next.js is 16.3: read `apps/website/node_modules/next/dist/docs/` before using an unfamiliar Next feature.
- After stopping `npm run start`, kill whatever still listens on :3000 before rebuilding or restarting.
- **Buffer:** 100 API requests per 15 minutes and **10 scheduled posts** on this plan. Never post publicly without the
  user's go-ahead; schedule days ahead, unschedule, verify 0 waiting. Never print or commit values from
  `apps/backend/.env` or `apps/website/.env.local`.
- **Claude Code's permission check** blocks commands that create real Buffer posts, and after that even related
  read-only commands. Don't work around it: stop, report what's half-done, and give the user the command (`! <command>`).

---

## Open items waiting on the user

- **Buffer's 10-scheduled-post cap:** upgrade Buffer, or have the calendar handle the cap (small change).
- **MCP decisions** (see "What's left" 1): where it lives, and how it authenticates before accounts exist.
- **Rotate the R2 token** (its values were pasted into the chat); scope the new one to `clipperai` and
  `clipperai-published`.
- **Delete the three Phase 6 test videos** on The Micro-Fix in YouTube Studio: two public (watch?v=NbWBjHIFG2M,
  watch?v=VHLmTNy7Ex8) and one private (watch?v=uVqdDp9WFvc).
- **Old CLI folders** `apps/backend/out/` (30 MB) and `work/` (185 MB): delete when no longer wanted (git-ignored).
- **Instagram:** switch @theprimefactor to a creator or business account and reconnect it in Buffer.
- **Custom domain** for the public bucket before launch (r2.dev is rate-limited).
- **Avast exceptions**, **Pro/Business prices** ($39 / $99 from the spec), **real payments** (off), **code license**
  (public repo, no license file), **Groq plan upgrade** before real customers.
