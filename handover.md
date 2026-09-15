# Handover: website redesigned; MCP scrapped; next is Phase 8, the Flutter mobile app

Updated 2026-09-15 (end of session 5). **Pushed to `main`:** the website redesign (`bf42176`) and the serif heading
accent (`5f7e3af`). **Decided 2026-09-15 (user):** the MCP server is scrapped; the second way to use the product is a
**Flutter mobile app in `apps/mobile`**; the backend is hosted on **Railway**; the domain is **`ytclipper.xyz`**.
**New way of working (user, 2026-09-15):** find things with the **graphify** map (`graphify query "..."`) instead
of reading `memory.md` end to end, and every feature ends with tests, all checks passing, `graphify update .` and a
memory update (details in CLAUDE.md). Commit and push only when the user asks.
**Not committed yet:** the documentation for all of the above (CLAUDE.md, memory.md, masterprompt.md, README,
DECISIONS, handover, phase0, `.gitignore`), the removal of `apps/mcp/.gitkeep` and the new `apps/mobile/` folder. Run
`git status` first; commit them when the user asks.
Start the next chat with:

> Read `handover.md` and `.claude/CLAUDE.md` (use `graphify query` for anything else), then start Phase 8 (the Flutter
> mobile app in `apps/mobile`) using the ponytail skill.

`.claude/CLAUDE.md` = goal, channels, Clerk decision, rules, commands. `.claude/memory.md` = full build log, what was
verified, what's left, gotchas. `README.md` = how the product works, API reference, setup. `DECISIONS.md` =
dependencies and why. `DESIGN.md` = the website's design system. `masterprompt.md` = the spec (§24–26 now describe the
mobile app). This file = where we stopped and what to do first.

---

## Where things stand

| Area | State |
|---|---|
| Phases 0–4: research, engine, jobs, storage | Done and tested. Real R2 checked live; a full project processed on real R2 not run yet (Avast) |
| Phase 5: website (`apps/website`) | Done, **redesigned** after the user's "Relink" reference: sky heroes, blue accent, Geist + blue italic serif accents, each nav link its own page, sidebar app. Light only |
| Billing (early Phase 9) | Plans Creator $15 / Pro $39 / Business $99 with monthly limits, per account. **Payments switched off (user decision)** |
| Phase 6: publishing (Buffer) | Done and working for real (YouTube "The Micro-Fix") |
| Phase 7: content calendar | Done; real Buffer tested (Buffer plan caps scheduled posts at 10) |
| Accounts (Clerk) | Built, tested, pushed. Development instance |
| **Phase 8: mobile app (Flutter)** | **Next.** `apps/mobile` exists (only `.gitkeep`). Flutter 3.47.1 / Dart 3.13.1 installed; `flutter doctor`: Android SDK 36 present but **licences not accepted** (`flutter doctor --android-licenses`) and **no emulator created yet** (`flutter emulators --create`); Chrome works; Visual Studio missing (only matters for Windows desktop builds, not a target); **iOS can't be built on this Windows PC** (needs a Mac or a cloud build) |
| Phase 9 cost tracking + payments (when asked) · Phase 10 Railway deploy + hardening | Not started |

**Ways to use the product: only the website and the mobile app.** Telegram bot, command-line tool and MCP server are
scrapped. **Accounts: Clerk for everything it offers.** **Payments only on the website** (no purchases in the app).

GitHub: https://github.com/HasbiyallahuJafaru/ClipperAi (**public**), branch `main` (no branches). Last pushed commit:
`5f7e3af`.

---

## What's left to build

1. **Phase 8, Flutter mobile app (next).** Settle with the user first: Clerk sign-in in Flutter (check Clerk's Flutter
   SDK status, or a fallback), the smallest set of packages (each gets a `DECISIONS.md` row), app name/bundle id,
   Android first vs. an iOS build route, and where the app talks to during development (emulator → local backend at
   `http://10.0.2.2:8000`, or deploy the backend to Railway first). A thin client of the existing REST API (no business logic of its own).
   First version: Clerk sign-in (check the Clerk Flutter SDK's maturity first), new project from a pasted/shared link or
   a video picked from the phone (upload with progress through `POST /api/uploads` + signed PUT), projects list with
   live status (poll), clip review (play, approve/reject, edit, copy posts), save/share clips, publish now/schedule +
   calendar list, plan and usage read-only. Later: push notifications, background uploads. Backend work it needs: the
   app calls FastAPI directly with `Authorization: Bearer <Clerk session token>` (check `authorized_parties` for tokens
   from the app), and a public HTTPS address (Railway) to test on a real phone; an emulator can reach the local backend.
   Design follows `DESIGN.md` (blue accent, Geist). Add a runnable check for the app (Flutter tests) like the website's.
2. **Per-account publishing connection** (each account its own Buffer key, or a multi-customer posting API) before real
   users sign up; until then only `BUFFER_OWNERS` can publish.
3. **Phase 9:** per-job cost tracking; new price list (user decides); payments only when asked (ask about Clerk Billing).
4. **Phase 10:** Railway deploy (API service, worker service, Railway Postgres; website hosting; Clerk production
   instance; domain **`ytclipper.xyz`**, subdomains to decide with the user), launch blockers from the pricing report, missing §46 tests. May move earlier so the app can be
   tried on a real phone.
5. **Smaller:** Buffer 10-scheduled-post cap handling, brand settings page, real video titles, hook re-render, real
   clip frames for the landing page preview.

---

## Run and check it locally

```bash
graphify update .                      # from the repo root: refresh the code map (CLI path in CLAUDE.md)
graphify query "your question"         # find code/docs instead of reading whole files

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
The local dev database has the 4 old ownerless projects plus one project and a Creator plan owned by
`user_3JMPnCcS92s2JtVKOl6xJvWA1SC` (created 2026-09-15, probably the user). The Clerk test
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
  to put in `BUFFER_OWNERS` so your account can publish, and say whether the 4 old projects should become yours. (A
  Clerk user `user_3JMPnCcS92s2JtVKOl6xJvWA1SC` already signed up locally on 2026-09-15; confirm it's you.)
- **Pricing:** accept, change or reject the proposed price list ($12/6 h, $24/20 h, $59/60 h, free 60 min; report:
  https://claude.ai/code/artifact/40731d89-cffa-4ab6-b520-a6dd461435ff).
- **Buffer's 10-scheduled-post cap:** upgrade Buffer or have the calendar handle it.
- **Rotate the R2 token** (its values were pasted into the chat); scope it to `clipperai` and `clipperai-published`.
- **Delete the three Phase 6 test videos** on The Micro-Fix (watch?v=NbWBjHIFG2M, watch?v=VHLmTNy7Ex8, private uVqdDp9WFvc).
- **Old CLI folders** `apps/backend/out/` (30 MB) and `work/` (185 MB): delete when no longer wanted.
- **Instagram:** switch @theprimefactor to a creator/business account and reconnect it in Buffer.
- Custom domain for the public bucket (on `ytclipper.xyz`), Avast exceptions, code license, Groq paid plan before real
  customers.
- **Mobile setup on this PC:** accept the Android SDK licences (`flutter doctor --android-licenses`, interactive) and
  decide on an iOS route (Mac or cloud build) if iOS is wanted in the first version.
