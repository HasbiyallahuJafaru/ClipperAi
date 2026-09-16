# Handover: the app is redesigned and signs in through the browser; payments are next

Updated 2026-09-16 (session 7). **Pushed to `main`: `68db596`** (clip count, app sign-in fix, app redesign, website
parity). Working tree is clean apart from three files left uncommitted on purpose: `apps/website/urlimg.png`, the root
`package.json` + `package-lock.json`, and `node_modules/`.

Start the next chat with:

> Read `handover.md` and `.claude/CLAUDE.md` (use `graphify query` for anything else), then build payments using the
> ponytail skill.

`.claude/CLAUDE.md` = goal, channels, decisions, rules, commands. `.claude/memory.md` = build log (look things up with
graphify, don't read it end to end). `README.md` = how the product works, API, setup. `DECISIONS.md` = dependencies.
`DESIGN.md` = design system (website and app). `masterprompt.md` = the spec. This file = where we stopped.

---

## What changed this session

1. **Only 3 clips per video (fixed).** The automatic count was `round(speech seconds / 360)` with a floor of 3, so
   every video under ~21 minutes got exactly 3. Now about **one clip per 2 minutes**, 3 to 30 (an hour → 30). DeepSeek
   `max_tokens` 16000 → 64000 so 30 clips of copy can't be cut off. The website hint, FAQ, tools page, README and
   `jobs.py` all say "about one per 2 minutes" (user confirmed 2026-09-16, over one per minute).
2. **App sign-in loop (fixed).** `clerk_auth` compared the typed identifier with Clerk's lowercased copy, so any
   capital letter ("Name@gmail.com") restarted the sign-in at the code step and **emailed a new code**, making the code
   people typed always wrong: "Incorrect code (ERROR RECEIVED FROM SERVER)", forever. Fixed in a patched copy of the
   package at `apps/mobile/third_party/clerk_auth` (one line, `dependency_overrides`), proven by
   `test/sign_in_test.dart` (replays Clerk's recorded replies; fails on the unpatched package).
3. **Google and Apple sign-in now open the phone's browser** and come back through `xyz.ytclipper.app://sso-callback`
   instead of a web view asking for the Google password again (`redirectionGenerator` + `app_links` in `clerkConfig`,
   intent filter + `flutter_deeplinking_enabled=false` in the manifest). Clerk accepts the scheme (checked live).
   **Email sign-in stays inside the app** (user's choice).
4. **The app was redesigned** to the reference screenshot the user sent, in our own colours and sky photo, and now has
   everything the website has. Layout, files and the new dependencies are in `DESIGN.md` and `DECISIONS.md`.

---

## Where things stand

| Area | State |
|---|---|
| Brand | **YT-Clipper** everywhere users see it (repo/buckets/code keep the old name) |
| Backend (Phases 1–4, 6, 7) | Done, tested, **deployed on Railway** (`api` + `worker`, Postgres). API https://api-production-e0fc.up.railway.app (`/health` 200). **The clip-count fix is not deployed yet** (`railway up --service api` and `--service worker`) |
| Website (Phase 5) | Done, on Vercel from `main`. **Still behind Vercel login** (Deployment Protection) |
| SEO | Done (metadata, sitemap, `/compare/*`, `/tools/*`, FAQ). Re-check the clip-count wording if it changes again |
| **Mobile app (Phase 8)** | Redesigned, feature-complete with the website, 21 tests + the sign-in test, `flutter analyze` clean. **The APK has not been rebuilt since the redesign, and has never run on a phone** |
| Billing (Phase 9) | Plans Creator $15 / Pro $39 / Business $99; **payments still off in code**. The provider and the rules are now decided (below) |
| Phase 10 | Domain, Clerk production instance, §46 hardening tests still to do |

GitHub: https://github.com/HasbiyallahuJafaru/ClipperAi (**public**), branch `main`.

---

## Next: payments (decided, not built)

Provider: **the ZoomGuru Payment API** (Paystack underneath). The guide is `apps/docs/payment-api-integration.md`.

> ⚠️ That file holds a **live API secret**. It is git-ignored (`.gitignore`) because this repo is public. Put the key
> in `apps/backend/.env` as `PAYMENT_API_KEY` and on Railway; never in the website or the app. The key has travelled
> through a chat and a file on disk, so **rotating it before launch is worth it** (Section 7 of the guide).

Decisions from the user (2026-09-16):

- **Charge in Naira, show prices in USD.** Plans stay $15 / $39 / $99; the charge is the USD price converted to kobo.
- **The rate is fetched live and refreshed daily**, with the last good rate kept as a fallback. Checkout must say what
  is actually being charged, e.g. "$15.00 a month, charged as ₦24,000".
- **Each payment buys 30 days.** No card is kept, nothing charges itself: near the end the plan shows "Renew" and the
  customer pays again. (The payment API does not manage subscriptions, and this avoids building card storage.)

What that means in code (nothing below exists yet):

1. `apps/backend/payments.py`: initialize a payment (amount in kobo, `external_customer_id` = owner, `plan`,
   `notification_url`, `callback_url`), verify a reference (authoritative), and apply a success **once** per reference.
2. A `payments` table (reference, owner, plan, usd cents, kobo, rate, status, applied_at) and an expiry on
   `subscriptions`, so `billing.current()` ignores a plan whose 30 days have run out.
3. Routes: `POST /api/billing/checkout` (returns the Paystack `authorization_url`), `POST /api/payments/callback`
   (public, **verify the HMAC-SHA512 signature over the raw body** before trusting it, then verify with the API), and a
   status route the website can poll. `POST /api/billing/subscribe` must stop handing out plans for free once
   `PAYMENT_API_KEY` is set.
4. The worker re-verifies payments still `pending` after ~15 minutes, so a missed callback heals itself.
5. Website: pricing and billing pages go through checkout and show the Naira amount; a return page polls the status.
   The app keeps sending people to the website for plans (app store rules), and should show the renewal date.
6. Tests: a fake payment API next to `fake_buffer.py`; cover a good callback, a forged signature, a repeated callback
   (idempotent), expiry, and reconciliation.

---

## Open items waiting on the user

1. **Deploy the backend** so the live site makes more clips: `railway up --service api --detach` and
   `--service worker` from `apps/backend`.
2. **Vercel → website → Settings → Deployment Protection:** set Vercel Authentication to "Only Preview Deployments"
   (or connect `ytclipper.xyz`), otherwise nobody can open the live site.
3. **Rebuild the APK and try it on a phone** (command in CLAUDE.md): Google sign-in in the browser, email sign-in,
   playback, upload, share from YouTube. Report what breaks.
4. **YouTube blocks Railway's servers** ("Sign in to confirm you're not a bot"). Uploads work; YouTube links need a
   residential proxy via `YTDLP_PROXY` on the worker (paid, user picks a provider).
5. **Buffer per-user connection:** check Buffer → Settings → API for an OAuth client. Until then only `BUFFER_OWNERS`
   can publish (empty on Railway, so nobody can publish from the live site).
6. **Pricing:** our Pro $39 vs OpusClip $29 / Submagic $39 / Klap $29; an earlier proposal ($12 / $24 / $59 + a free
   60 minutes) would undercut them. Decide before payments go live, since the prices become real money.
7. **Rotate the payment API key** (above) and the R2 token; delete the three Phase 6 test videos and the old
   `apps/backend/out/` and `work/`; Instagram creator account; Groq paid plan; code license; the preview image's logo
   says "YT Clipper" without the hyphen.
8. **Auto-detect burned-in subtitles?** Asked, not built (the manual switch exists).

---

## What's left to build

1. Payments (above), then per-job cost tracking (Phase 9).
2. Whatever breaks on a real phone; Play Store signing key (`android/key.properties`) and store listing. Upgrade
   `receive_sharing_intent` to 1.9+ (and drop the `kotlin.jvm.target.validation.mode` line) once Flutter's Android
   Gradle plugin supports compileSdk 37.
3. iOS: a build route (Mac or cloud build) and the Share Extension.
4. Buffer per-user connection.
5. Phase 10: domain + subdomains (ask before DNS), Clerk production instance, §46 tests (large/long/malformed videos,
   provider outages, duplicates, cost limits, cleanup).
6. Smaller: Buffer's 10-scheduled-post cap, brand settings, real video titles, real clip frames for the landing preview.

---

## Run and check it locally

```bash
graphify update .                      # refresh the code map (CLI path in CLAUDE.md)
cd apps/backend && export PATH="$PATH:/c/Users/USER/AppData/Local/Microsoft/WinGet/Links"
.venv/Scripts/python test_clipper.py && .venv/Scripts/python test_jobs.py     # both print ok
cd ../website && export NODE_EXTRA_CA_CERTS=C:/Users/USER/.certs/ca-bundle-with-windows-roots.pem
npm run build && npm run start && node check.mjs                              # ok
cd ../mobile && flutter analyze && flutter test                               # 21 tests + the sign-in test
flutter test test/render.dart --update-goldens   # every screen as a picture in test/goldens/ (git-ignored)
```
APK build, deploy and Vercel/Railway commands: see CLAUDE.md. On this PC port 8000 is held by an older backend and
port 3000 by an older website, both started outside this project: run the website's checks on another port
(`npx next start -p 3001 && node check.mjs http://localhost:3001`). `walkthrough.mjs` needs `dev.py --fake-buffer` on
port 8000 and has not been run since session 5.

---

## Environment gotchas on this PC (details in memory.md)

- **Avast** re-signs HTTPS: Node needs `NODE_EXTRA_CA_CERTS` (npm, Next server, Vercel CLI, Clerk CLI), boto3
  `AWS_CA_BUNDLE`, Clerk's Python SDK `SSL_CERT_FILE`, **Gradle/Java `JAVA_TOOL_OPTIONS=-Djavax.net.ssl.trustStoreType=Windows-ROOT`**.
- **Clerk's own API (FAPI) answers 403 to Python's default user agent** when scripting it: set a browser-ish one.
- **Git Bash rewrites `/paths` in arguments** (`vercel api /v9/...`, curl URLs): use `MSYS_NO_PATHCONV=1`, or node/PowerShell.
- **PowerShell variables are case-insensitive** (`$s` overwrites `$S`).
- Heredocs with apostrophes break in the Bash tool: write the script to a scratchpad file and run it.
- Flutter can't load `.woff2`: fonts are converted to TTF with fontTools.
- **`phosphor_flutter` cannot compile on Flutter 3.47** (it extends `IconData`, now a final class): `flutter analyze`
  passes and the build fails. The app uses `phosphor_icons` 3.0.1 instead.
- **Golden renders need real async** (`tester.runAsync`) or photos and network pictures come out blank, and package
  fonts must be loaded by hand from the pub cache.
- **APK build:** first run ~12 min (Gradle + SDK downloads), then ~4 min. `receive_sharing_intent` is pinned to 1.8.1
  and needs `kotlin.jvm.target.validation.mode=warning` in `android/gradle.properties`. A background build's
  "completed" can hide a failed Gradle run: read the log's exit line.
- Buffer: 100 requests / 15 min, 10 scheduled posts; never post publicly without the user's go-ahead.
