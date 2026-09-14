# Handover: start Phase 6 (publishing through Buffer)

Updated 2026-09-14 at the end of build session 2. Everything is committed and pushed to `main`. Start the next chat
with:

> Read `handover.md`, `.claude/CLAUDE.md` and `.claude/memory.md`, then start Phase 6 (publishing through Buffer)
> using the ponytail skill (and the design skills impeccable, ui-ux-pro-max and design-taste-frontend for UI work).

`.claude/CLAUDE.md` = goal, channels, rules, commands. `.claude/memory.md` = full build log, what was verified, what's
left, gotchas. `README.md` = how the product works, API reference, setup. `DECISIONS.md` = dependencies and why.
This file = where we stopped and what to do first.

---

## Where things stand

| Area | State |
|---|---|
| Phases 0–4: research, engine, jobs, storage | Done and tested. **Real Cloudflare R2 never tested** (token lacks R2 permission) |
| Phase 5: website (`apps/website`) | Done, works locally: batch submit (links or files), live progress, clip review (approve / reject / edit, copy posts), Download all (ZIP), cancel / delete |
| Billing (early part of Phase 9) | Pricing → checkout → billing pages; plans Creator $15 / Pro $39 / Business $99 with monthly limits enforced in the backend. **Payments switched off on purpose (user decision): subscribing charges nothing.** One workspace, no sign-in |
| Phase 6: publishing (Buffer) | **Next** |
| Phase 7 calendar, 8 MCP, Telegram bot, 9 accounts + real payments + cost tracking, 10 deploy | Not started |

GitHub: https://github.com/HasbiyallahuJafaru/ClipperAi (**public**), branch `main` (no branches: commit straight to
`main`, only when the user asks).

---

## Run and check it locally

```bash
cd apps/backend
export PATH="$PATH:/c/Users/USER/AppData/Local/Microsoft/WinGet/Links"   # ffmpeg in Bash tool shells
.venv/Scripts/python test_clipper.py && .venv/Scripts/python test_jobs.py  # both print ok
.venv/Scripts/python dev.py            # API :8000 + worker + fake S3 :9000 + local Postgres (pgdata/)

cd apps/website
npm run build && npm run start         # http://127.0.0.1:3000 (.env.local exists on this PC). Choose a plan first (free)
node check.mjs                         # proxy checks, no paid calls
cd ../backend && .venv/Scripts/python dev_fixture.py            # -> <project id> <media folder>
cd ../website && node walkthrough.mjs <project id> <media folder>   # clicks through every flow in headless Edge
```

The local dev database currently has **no plan** and 4 old projects (test data was cleaned up).

---

## Environment gotchas on this PC (details in memory.md)

- **Avast Web Shield blocks real end-to-end runs right now:** local HTTP downloads over ~1–2 MB stall and reset (even
  Python's own web server), yt-dlp HTTPS fails with `CERTIFICATE_VERIFY_FAILED`, and a DeepSeek call appeared to hang.
  Not a code bug. The user needs to add Avast exceptions for `127.0.0.1`/`localhost` and HTTPS scanning, or pause Web
  Shield, before a real video can be processed through `dev.py`. Test with small files until then.
- npm needs `NODE_EXTRA_CA_CERTS=C:/Users/USER/.certs/ca-bundle-with-windows-roots.pem`; boto3 uses `AWS_CA_BUNDLE`
  (already in `apps/backend/.env`).
- Next.js is 16.3: read `apps/website/node_modules/next/dist/docs/` before using an unfamiliar Next feature.
- After stopping `npx next start`, kill whatever still listens on :3000 before starting it again.
- Never print or commit values from `apps/backend/.env` or `apps/website/.env.local`.

---

## Next up: Phase 6, publishing through Buffer

What's already known (verify against Buffer's current docs at build time):
- Spec: `masterprompt.md` §22 (use a provider, users connect their own account, OAuth, never social passwords), §46
  publishing tests (OAuth failure, expired token, rate limits, publishing failure, scheduled post), §47 acceptance
  (approved clips → posts sent to the provider → user sees publishing status).
- `DECISIONS.md`: Buffer GraphQL API (`https://api.buffer.com`, Bearer). Post creation takes a **public video URL**
  plus scheduling fields. Buffer OAuth for third-party apps may not be open to new developers → MVP fallback is the
  user pasting a personal Buffer API key. `BUFFER_API_KEY` is already in `apps/backend/.env` (the user's own key).
- Project rules: one `publishing.py` service (no interface with a single implementation, despite §22's sketch);
  routes thin; website UI via the existing `/api/*` proxy. Only approved clips should be publishable; show status per
  clip. Scheduling many clips across days is Phase 7, not Phase 6.
- **Prerequisite for a real test:** Buffer downloads the video from the URL over the internet, so the fake S3 at
  `127.0.0.1:9000` can't work. A real publish needs the live R2 bucket (see below) or a mocked Buffer for tests.
- Signed download links last 24 h (R2 max 7 days): hand Buffer a fresh link at send time and check whether Buffer
  copies the media or keeps fetching it.

Suggested first steps: confirm Buffer's current API and auth options → decide with the user (OAuth app vs pasted key)
→ backend service + migration + tests with a mocked Buffer → website "Publish / Schedule" on approved clips + an
integrations page to connect Buffer → real test once R2 works.

---

## Open items waiting on the user

- **R2 live test:** the Cloudflare token (account `cc1b1537ed8b55e4e7bb17b518285b38`) has no R2 permission. Add
  *Account → Workers R2 Storage → Edit*, or create an R2 *Admin Read & Write* token and put its keys in `.env`; enable R2
  and create bucket `clipperai-media`, then `python storage.py setup`. Needed for Phase 6 real publishing.
- **Avast exceptions** (above).
- **Pro and Business prices** use the spec's $39 / $99 (the user only set "start at $15").
- **Real payments** stay off until the user asks; provider not chosen.
- **Code license** (repo is public with no license file) and **Groq plan upgrade** before real customers.
