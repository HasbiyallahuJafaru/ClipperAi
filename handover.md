# Handover: payments live; per-user Buffer OAuth built; register the Buffer app and go live

Updated 2026-09-16 (session 8). **Pushed to `main`: `0808d2c`** (payments + rate limiting in `2bd3d35`, docs in
`51742bd`, per-user Buffer OAuth in `0808d2c`), and **payments/rate limiting/clip-count deployed to Railway** (api
`62132cad`, worker `6bf8bb93`). The website auto-deploys on Vercel from `main`. Working tree is clean apart from the
three files left uncommitted on purpose (`apps/website/urlimg.png`, root `package.json` + lock, `node_modules/`).

Start the next chat with:

> Read `handover.md` and `.claude/CLAUDE.md` (use `graphify query` for anything else), then continue with the open
> items below, using the ponytail skill.

`.claude/CLAUDE.md` = goal, channels, decisions, rules, commands. `.claude/memory.md` = build log (look things up
with graphify, don't read it end to end). `README.md` = how the product works, API, setup. `DECISIONS.md` =
dependencies. `DESIGN.md` = design system (website and app). `masterprompt.md` = the spec. This file = where we
stopped.

---

## What changed this session

1. **Payments (Phase 9) are built, tested and live.** ZoomGuru Payment API (Paystack underneath). Prices shown in
   USD, charged in Naira: kobo = `usd_cents × live USD→NGN rate`, fetched from open.er-api.com, cached in a one-row
   `fx_rate` table (24 h refresh, last good rate kept on failure, 1600 seed). **Each payment buys 30 days**; nothing
   is stored about cards, nothing auto-charges — near the end the plan shows the renewal date and the customer pays
   again. Renewing the same plan stacks the remaining days; switching starts fresh 30 days.
   - `payments.py`: `checkout()` (server-side pricing → hosted Paystack page), `signed()` (HMAC-SHA512 over the raw
     webhook body), `apply()` (the **only** code that activates a plan; its `applied_at is null` update runs once
     per reference), `reconcile()` (worker re-verifies payments still pending after 15 min).
   - Migration `007_payments.sql`: `payments` table, `subscriptions.expires_at` (existing active plans got a free
     30 days), `fx_rate`. `billing.current()` ignores an expired plan (lapsed = no plan, like cancel).
     `billing.subscribe()` refuses to hand out free plans once `PAYMENT_API_KEY` is set.
   - Routes: `POST /api/billing/checkout` `{plan, email}` → authorization_url + kobo + rate; public
     `POST /api/payments/callback` (signature-verified, throttled); `GET /api/billing/payments/{ref}` for polling.
   - Website: checkout takes an email (prefilled from Clerk), shows "charged as ₦X at ₦Y/$" before redirecting to
     Paystack; new `/checkout/return` polls until the backend confirms; billing page shows "active until {date}".
   - App: shows the renewal date (`account.dart`). Still no purchases in the app (store rules).
   - Tests: `fake_payments.py` (next to `fake_buffer.py`) — good callback, forged signature, duplicate apply,
     expiry, reconciliation healing, rate fallback, no free subscribe with the key set.
2. **Rate limiting** in `api.py`: in-memory fixed window when no `REDIS_URL`, Redis `INCR/EXPIRE` when there is one
   (Railway's Redis plugin, added via CLI; falls back to memory if Redis is down). Signed-in users 240 req/min;
   uploads 10/min, project starts 10/min, checkout 5/min per account; webhook 30/min per IP. 429 with a readable
   message. `redis==6.4.0` added to requirements.
3. **Railway set up via CLI:** one Redis service (an `add` prompt mishap created three; extras + volumes deleted),
   `REDIS_URL` wired to `redis.railway.internal:6379`, and `PAYMENT_API_KEY`, `PUBLIC_API_URL`, `WEBSITE_URL` set
   on api. Everything deployed: payments, rate limiting and the session-7 clip-count fix are live.
4. **Per-user Buffer OAuth (the multi-user publishing fix) is built, not yet live.** The cheap workaround over
   direct platform APIs: Buffer client registration is **self-serve** (Buffer → Settings → API), so each user
   connects their own Buffer account (Authorization Code + PKCE, single-use rotating refresh tokens) and publishes
   through **their** channels and request limits — all six networks, no app reviews. Built: `oauth.py`, migration
   `008_accounts.sql` (`connected_accounts`, `oauth_states`), `publishing.call(token=)` (owner's token, else the
   workspace `BUFFER_OWNERS` key as fallback), routes `GET/POST /api/publishing/{connection,connect/buffer,callback}`,
   website Connect/Disconnect on `/settings/integrations` + `/oauth/return` page. Tests in `test_jobs.py` via
   `fake_buffer`'s new auth endpoint (rotation, replay refusal, owner isolation). **To go live: register the app in
   Buffer → Settings → API with redirect `https://ytclipper.xyz/oauth/return`, set `BUFFER_CLIENT_ID` +
   `BUFFER_CLIENT_SECRET` on Railway + `.env`, deploy api + worker.**
5. **New APK built** (`app-release.apk`, 61.2 MB, release, live API URL) — first build since the redesign; still
   never run on a phone.

---

## Where things stand

| Area | State |
|---|---|
| Brand | **YT-Clipper** everywhere users see it (repo/buckets/code keep the old name) |
| Backend (Phases 1–4, 6, 7, 9) | Done, tested, **deployed on Railway** (`api` + `worker`, Postgres + Redis). API https://api-production-e0fc.up.railway.app (`/health` 200, payments routes live) |
| Website (Phase 5) | On Vercel from `main`, **deployed 2026-09-16**. **Still behind Vercel login** (Deployment Protection) |
| Billing | **Live**: checkout → Paystack (NGN) → webhook/verify → 30 days. ⚠️ A real end-to-end purchase has not been made yet |
| Mobile app (Phase 8) | Redesigned, feature-complete, 21 tests + sign-in test, `flutter analyze` clean, new APK built — **never run on a phone** |
| Phase 10 | Domain, Clerk production instance, §46 hardening tests still to do |

GitHub: https://github.com/HasbiyallahuJafaru/ClipperAi (**public**), branch `main`.

---

## Open items waiting on the user

1. **Register the YT-Clipper app in Buffer → Settings → API** (redirect `https://ytclipper.xyz/oauth/return`) and
   set `BUFFER_CLIENT_ID`/`BUFFER_CLIENT_SECRET` on Railway — then deploy api+worker and connect your own account
   as the first per-user test. (Research notes: socialmediascheduler repo = no license, read-only reference;
   Open-Dispatch = MIT, adapter reference for direct APIs later.)
2. **Test a real purchase end to end** (₦ amount at live rate, Paystack page, webhook, plan active 30 days,
   renewal stacking). Payments charge real money now.
3. **Vercel → website → Settings → Deployment Protection:** "Only Preview Deployments", otherwise nobody can open
   the live site.
4. **Run the APK on a phone** — it's built (`apps/mobile/build/app/outputs/flutter-apk/app-release.apk`);
   try Google sign-in (browser round-trip), email sign-in, playback, upload, share from YouTube.
5. **Rotate the payment API key** before launch (it travelled through a chat and a file on disk; guide §7) — replace
   in Railway + `.env`. Same list as before: R2 token, delete Phase 6 test videos and old `out/`/`work/`, Instagram
   creator account, Groq paid plan, code license, preview logo missing the hyphen.
6. **YouTube blocks Railway's servers** ("Sign in to confirm you're not a bot") — needs a residential proxy via
   `YTDLP_PROXY` on the worker (paid, user picks).
7. **Pricing sanity:** our $15/$39/$99 vs OpusClip $29 / Submagic $39 / Klap $29; the earlier $12/$24/$59 + free
   60 minutes proposal would undercut them. Prices are real money now.
8. Auto-detect burned-in subtitles? Asked, not built (the manual switch exists).

---

## What's left to build

1. Per-job cost tracking (Phase 9 remainder).
2. Direct platform publishing (LinkedIn/YouTube/Threads) for users who won't use Buffer — port Open-Dispatch's MIT
   adapters into the `connected_accounts` table (`provider` already allows it). Meta/TikTok need app reviews; X is
   paid. Buffer OAuth covers everyone else.
3. Whatever breaks on a real phone; Play Store signing key (`android/key.properties`) and store listing. Upgrade
   `receive_sharing_intent` to 1.9+ once Flutter's Android Gradle plugin supports compileSdk 37.
4. iOS: a build route (Mac or cloud build) and the Share Extension.
5. Phase 10: domain + subdomains (ask before DNS), Clerk production instance, §46 tests (large/long/malformed
   videos, provider outages, duplicates, cost limits, cleanup).
6. Smaller: Buffer's 10-scheduled-post cap, brand settings, real video titles, real clip frames for the landing
   preview.

---

## Run and check it locally

```bash
graphify update .                      # refresh the code map (CLI path in CLAUDE.md)
cd apps/backend && export PATH="$PATH:/c/Users/USER/AppData/Local/Microsoft/WinGet/Links"
.venv/Scripts/python test_clipper.py && .venv/Scripts/python test_jobs.py     # both print ok (payments too)
cd ../website && export NODE_EXTRA_CA_CERTS=C:/Users/USER/.certs/ca-bundle-with-windows-roots.pem
npm run build && npm run start && node check.mjs                              # ok
cd ../mobile && flutter analyze && flutter test                               # 21 tests + the sign-in test
flutter test test/render.dart --update-goldens   # every screen as a picture in test/goldens/ (git-ignored)
```
APK build, deploy and Vercel/Railway commands: see CLAUDE.md. On this PC port 8000 is held by an older backend and
port 3000 by an older website, both started outside this project: run the website's checks on another port
(`npx next start -p 3001 && node check.mjs http://localhost:3001`). `walkthrough.mjs` needs `dev.py --fake-buffer`
on port 8000 and has not been run since session 5. Note: with `PAYMENT_API_KEY` in `.env`, local checkout calls the
real provider (test with the fake in `test_jobs.py` instead).

---

## Environment gotchas on this PC (details in memory.md)

- **Avast** re-signs HTTPS: Node needs `NODE_EXTRA_CA_CERTS` (npm, Next server, Vercel CLI, Clerk CLI), boto3
  `AWS_CA_BUNDLE`, Clerk's Python SDK `SSL_CERT_FILE`, **Gradle/Java `JAVA_TOOL_OPTIONS=-Djavax.net.ssl.trustStoreType=Windows-ROOT`**.
  curl needs `--cacert C:/Users/USER/.certs/ca-bundle-with-windows-roots.pem` (plain `curl` to HTTPS fails with 000).
- **Clerk's own API (FAPI) answers 403 to Python's default user agent** when scripting it: set a browser-ish one.
- **Git Bash rewrites `/paths` in arguments** (`vercel api /v9/...`, curl URLs): use `MSYS_NO_PATHCONV=1`, or node/PowerShell.
- **PowerShell variables are case-insensitive** (`$s` overwrites `$S`).
- Heredocs with apostrophes break in the Bash tool: write the script to a scratchpad file and run it.
- **`railway add`/`service delete` prompts confirm on piped newlines** — one newline per prompt, and `printf '\n\n\n'`
  created three Redis instances (extras deleted, including their detached volumes, which linger in `status` output
  after deletion).
- Flutter can't load `.woff2`: fonts are converted to TTF with fontTools.
- **`phosphor_flutter` cannot compile on Flutter 3.47** (it extends `IconData`, now a final class): `flutter analyze`
  passes and the build fails. The app uses `phosphor_icons` 3.0.1 instead.
- Golden renders need real async (`tester.runAsync`) or photos and network pictures come out blank, and package
  fonts must be loaded by hand from the pub cache.
- **APK build:** first run ~12 min (Gradle + SDK downloads), then ~4 min. `receive_sharing_intent` is pinned to 1.8.1
  and needs `kotlin.jvm.target.validation.mode=warning` in `android/gradle.properties`. A background build's
  "completed" can hide a failed Gradle run: read the log's exit line.
- Buffer: 100 requests / 15 min, 10 scheduled posts; never post publicly without the user's go-ahead.
