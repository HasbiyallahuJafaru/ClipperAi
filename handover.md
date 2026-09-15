# Handover: Phase 6 built, next is Phase 7 (content calendar)

Updated 2026-09-15 at the end of build session 3. **Phase 6 is done, tested against the real services and pushed to
`main`.** Start the next chat with:

> Read `handover.md`, `.claude/CLAUDE.md` and `.claude/memory.md`, then start Phase 7 (content calendar) using the
> ponytail skill (and the design skills impeccable, ui-ux-pro-max and design-taste-frontend for UI work).

`.claude/CLAUDE.md` = goal, channels, rules, commands. `.claude/memory.md` = full build log, what was verified, what's
left, gotchas. `README.md` = how the product works, API reference, setup. `DECISIONS.md` = dependencies and why.
This file = where we stopped and what to do first.

---

## Where things stand

| Area | State |
|---|---|
| Phases 0–4: research, engine, jobs, storage | Done and tested. Real R2 bucket `clipperai` set up and storage checked live (2026-09-15); a full project on real R2 not run yet |
| Phase 5: website (`apps/website`) | Done, works locally: batch submit, live progress, clip review, Download all (ZIP), cancel / delete |
| Billing (early part of Phase 9) | Plans Creator $15 / Pro $39 / Business $99 with monthly limits in the backend. **Payments switched off (user decision).** One workspace, no sign-in |
| Phase 6: publishing (Buffer) | **Done and working for real** (2026-09-15): through the website against real Buffer + R2, post now and a scheduled post reached YouTube "The Micro-Fix", unschedule worked. Instagram @theprimefactor is a personal profile, which Buffer won't post to automatically (shown as not usable) |
| Phase 7 calendar | **Next** |
| Phase 8 MCP, Telegram bot, 9 accounts + real payments + cost tracking, 10 deploy | Not started |

GitHub: https://github.com/HasbiyallahuJafaru/ClipperAi (**public**), branch `main` (no branches: commit straight to
`main`, only when the user asks).

### What Phase 6 added
- `apps/backend/publishing.py` (service), `migrations/005_publishing.sql` (`publications`), `fake_buffer.py`
  (test double), routes in `api.py`, publishing checks at the end of `test_jobs.py`, `dev.py --fake-buffer`.
- Website: **Publish** on approved clips (choose channels, post now or later, per-clip post status, unschedule),
  `/settings/integrations` ("Publishing" in the nav).
- The workspace's `BUFFER_API_KEY` in `.env` is the Buffer connection (no key form, no OAuth: Buffer's third-party app
  registration is reported closed). Buffer channels: YouTube "The Micro-Fix", Instagram @theprimefactor.
- **Buffer can't read signed links** (tested live), so, as the user chose: each post gets its own copy of the clip in
  the public bucket `clipperai-published` (r2.dev address, in `.env` as `S3_PUBLIC_BUCKET` / `S3_PUBLIC_URL`), deleted
  once the post is out; 45-day backstop rule. Scheduling goes up to **30 days** ahead. YouTube posts need a category
  (fixed "22").

---

## Run and check it locally

```bash
cd apps/backend
export PATH="$PATH:/c/Users/USER/AppData/Local/Microsoft/WinGet/Links"   # ffmpeg in Bash tool shells
.venv/Scripts/python test_clipper.py && .venv/Scripts/python test_jobs.py  # both print ok
.venv/Scripts/python dev.py --fake-buffer   # API :8000 + worker + fake S3 :9000 + fake Buffer + local Postgres

cd apps/website
npm run build && npm run start         # http://127.0.0.1:3000 (.env.local exists on this PC). Choose a plan first (free)
node check.mjs                         # proxy checks, no paid calls
cd ../backend && .venv/Scripts/python dev_fixture.py            # -> <project id> <media folder>
cd ../website && node walkthrough.mjs <project id> <media folder>   # every flow incl. publishing, headless Edge
```

The local dev database has **no plan** and 4 old projects (test data was cleaned up).

---

## Environment gotchas on this PC (details in memory.md)

- **Avast Web Shield** breaks real end-to-end runs: local HTTP downloads over ~1–2 MB stall, yt-dlp HTTPS fails with
  `CERTIFICATE_VERIFY_FAILED`. Not a code bug. Test with small files until the user adds exceptions.
- npm needs `NODE_EXTRA_CA_CERTS=C:/Users/USER/.certs/ca-bundle-with-windows-roots.pem`; boto3 uses `AWS_CA_BUNDLE`.
- Next.js is 16.3: read `apps/website/node_modules/next/dist/docs/` before using an unfamiliar Next feature.
- After stopping `npm run start`, kill whatever still listens on :3000 before rebuilding or restarting.
- Buffer allows 100 API requests per 15 minutes; don't loop against the real API. Never print or commit values from
  `apps/backend/.env` or `apps/website/.env.local`.

---

## Next up: Phase 7, content calendar

Spec: `masterprompt.md` §41 (simple list calendar), §40 ("Schedule all"), §47 (user creates schedule → posts sent →
status). Settings in the spec: frequency, days, times, start date, platforms → spread approved clips over days; list
UI; `calendar.csv` in the content package. Reuse `publishing.publish` for each slot.

The link-expiry problem is already solved by the public copies: one post per slot through `publishing.publish`, up to
30 days ahead. Watch Buffer's limit (100 requests / 15 min) when scheduling many clips at once.

---

## Open items waiting on the user

- **Delete the three test videos** on The Micro-Fix in YouTube Studio: two public ("ClipperAi test post 1" and "2",
  watch?v=NbWBjHIFG2M, watch?v=VHLmTNy7Ex8) and one private ("ClipperAi test", watch?v=uVqdDp9WFvc).
- **Instagram:** switch @theprimefactor to a creator or business account (free, Instagram settings) and reconnect it
  in Buffer; then an Instagram post can be tested.
- **Rotate the R2 token** (its values were pasted into the chat); scope the new one to `clipperai` and
  `clipperai-published`.
- **Custom domain** for the public bucket before launch (r2.dev is rate-limited).
- Optional: a YouTube privacy choice (public / unlisted / private) on the Publish form.
- **Avast exceptions**, **Pro/Business prices** ($39 / $99 from the spec), **real payments** (off), **code license**
  (public repo, no license file), **Groq plan upgrade** before real customers.
