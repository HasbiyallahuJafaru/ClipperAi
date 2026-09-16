# Handover: the app is redesigned and signs in through the browser; payments are next

Updated 2026-09-16 (session 7). **This session:** the 3-clip bug (now about one clip per 2 minutes), the app sign-in
loop (a patched copy of `clerk_auth`), the app redesigned to the user's reference with website parity, and Google/Apple
sign-in moved out of the web view into the phone's browser. **Next: payments** (ZoomGuru Payment API / Paystack,
charge in Naira, show USD; the doc is `apps/docs/payment-api-integration.md`, git-ignored because it holds a live key).

Older notes from session 6 follow.

Updated 2026-09-15 (end of session 6). **Pushed to `main`:** `7f92aa8` (rename to YT-Clipper, Railway deploy, Flutter
app, SEO pages, captions switch) and `2372f2f` (docs). Vercel deployed it. **Not committed yet:** the APK build fixes
(`apps/mobile/pubspec.yaml` + `pubspec.lock` pin, `android/gradle.properties` line), `DECISIONS.md` pin note, and this
final docs update (handover, CLAUDE.md, memory). Run `git status`; commit and push only when the user asks.
Start the next chat with:

> Read `handover.md` and `.claude/CLAUDE.md` (use `graphify query` for anything else), then continue with the open
> items (APK on a phone, Buffer per-user connection) using the ponytail skill.

`.claude/CLAUDE.md` = goal, channels, decisions, rules, commands. `.claude/memory.md` = build log (look things up with
graphify, don't read it end to end). `README.md` = how the product works, API, setup. `DECISIONS.md` = dependencies.
`DESIGN.md` = design system (website and app). `masterprompt.md` = the spec. This file = where we stopped.

---

## Where things stand

| Area | State |
|---|---|
| Brand | **YT-Clipper** everywhere users see it (repo/buckets/code keep the old name) |
| Backend (Phases 1–4, 6, 7) | Done, tested, **deployed on Railway** (`api` + `worker` services, Postgres). API https://api-production-e0fc.up.railway.app (`/health` 200). All secrets set on both services |
| Website (Phase 5) | Done, **deployed on Vercel** from `main`. Env vars set. **The `.vercel.app` URL is still behind Vercel login** (Deployment Protection "all except custom domains"; the change was blocked for Claude) |
| SEO | Done: metadata, sitemap, robots, share image, JSON-LD, `/compare/*` (OpusClip, Klap, Vizard, Submagic), `/tools/*` (3 keyword pages), 16-question FAQ, pricing promises. Research in OpenSEO project `YT-Clipper` |
| Clips | Hook overlay removed; captions switch per project (website + app); caption file always in the download |
| Progress UX | `progress` % + YouTube `thumbnail` on every project; website + app show the picture filling up and a bar |
| **Mobile app (Phase 8)** | Feature-complete with the website, 13 tests, launcher icon. **Release APK built** 2026-09-15: `apps/mobile/build/app/outputs/flutter-apk/app-release.apk` (59 MB, not committed; label YT-Clipper, minSdk 24, points at the Railway API, **debug-signed**). **Never installed or opened on a phone yet** |
| Billing (Phase 9) | Plans Creator $15 / Pro $39 / Business $99; **payments off**. Price change proposed, not decided |
| Phase 10 | Railway deploy done early; domain, Clerk production instance, hardening tests still to do |

GitHub: https://github.com/HasbiyallahuJafaru/ClipperAi (**public**), branch `main`.

---

## Open items waiting on the user

1. **Vercel → website → Settings → Deployment Protection:** set Vercel Authentication to "Only Preview Deployments" (or
   connect `ytclipper.xyz`), otherwise nobody can open the live site.
2. **YouTube blocks Railway's servers** ("Sign in to confirm you're not a bot"). Projects from YouTube links fail with a
   readable message; uploads work. Real fix: a residential proxy via `YTDLP_PROXY` on the Railway worker (user picks a
   provider; paid).
3. **Buffer per-user connection:** check Buffer → Settings → API for creating an OAuth client. If yes: build a
   "Connect Buffer" button (~1–2 days). If no: per-user API key, or a multi-customer posting API. Until then only
   `BUFFER_OWNERS` can publish (currently empty on Railway, so nobody can publish from the live site).
4. **Try the APK on a phone** (sideload; allow unknown apps): Clerk sign-in (beta SDK, dev instance; if it fails,
   enable native applications / "Native API" in the Clerk dashboard), playback, upload, share from YouTube. YouTube
   links fail until `YTDLP_PROXY` is set; publishing needs the user's Clerk id in `BUFFER_OWNERS` on Railway. Report
   back what breaks. (Android SDK licences turned out not to block the build.)
5. **Auto-detect burned-in subtitles?** Asked; not built (the manual switch exists).
6. **Pricing:** our Pro $39 vs OpusClip Pro $29 / Submagic Pro $39 / Klap $29; the earlier proposal ($12 / $24 / $59 +
   free 60 min) would undercut them. User decides.
7. Earlier items still open: rotate the R2 token, delete the three Phase 6 test videos, Instagram creator account,
   delete old `apps/backend/out/` and `work/`, Groq paid plan, code license, preview image logo says "YT Clipper"
   (no hyphen).
8. **Root `package.json` + `node_modules/` (`@vercel/analytics`)** appeared at 17:40 on 2026-09-15, not created by
   Claude; left uncommitted. Also `apps/website/urlimg.png` (original of the share image) is uncommitted on purpose.

---

## What's left to build

1. Fix what breaks on a real phone. Play Store signing key (`android/key.properties`), store listing. Upgrade
   `receive_sharing_intent` to 1.9+ (and drop the `kotlin.jvm.target.validation.mode` line) once Flutter's Android
   Gradle plugin supports compileSdk 37.
2. iOS: build route (Mac or cloud build) and the Share Extension for sharing into the app.
3. Buffer per-user connection (item 3 above).
4. Phase 9: per-job cost tracking; payments only when asked (ask about Clerk Billing).
5. Phase 10: domain + subdomains (ask before DNS), Clerk production instance, §46 tests (large/long/malformed videos,
   outages, duplicates, cost limits, cleanup).
6. Smaller: Buffer 10-scheduled-post cap, brand settings, real video titles, real clip frames for the landing preview.

---

## Run and check it locally

```bash
graphify update .                      # refresh the code map (CLI path in CLAUDE.md)
cd apps/backend && export PATH="$PATH:/c/Users/USER/AppData/Local/Microsoft/WinGet/Links"
.venv/Scripts/python test_clipper.py && .venv/Scripts/python test_jobs.py     # both print ok
cd ../website && export NODE_EXTRA_CA_CERTS=C:/Users/USER/.certs/ca-bundle-with-windows-roots.pem
npm run build && npm run start && node check.mjs                                # ok
cd ../mobile && flutter analyze && flutter test                                 # 13 passing
```
APK build, deploy and Vercel/Railway commands: see CLAUDE.md. Port 8000 on this PC was held by an older backend of
unknown version (walkthrough.mjs not run this session).

---

## Environment gotchas on this PC (details in memory.md)

- **Avast** re-signs HTTPS: Node needs `NODE_EXTRA_CA_CERTS` (npm, Next server, Vercel CLI, Clerk CLI), boto3
  `AWS_CA_BUNDLE`, Clerk's Python SDK `SSL_CERT_FILE`, **Gradle/Java `JAVA_TOOL_OPTIONS=-Djavax.net.ssl.trustStoreType=Windows-ROOT`**.
- **Git Bash rewrites `/paths` in arguments** (`vercel api /v9/...`, curl URLs): use `MSYS_NO_PATHCONV=1`, or node/PowerShell.
- **PowerShell variables are case-insensitive** (`$s` overwrites `$S`).
- Heredocs with apostrophes break in the Bash tool: write the script to a scratchpad file and run it.
- Flutter can't load `.woff2`: fonts are converted to TTF with fontTools.
- **APK build:** first run ~12 min (Gradle + SDK downloads), then ~4 min. `receive_sharing_intent` 1.9.0 needs
  compileSdk 37 (AGP 9.1 max 36) → pinned 1.8.1, whose Java 11 vs Kotlin 21 targets need
  `kotlin.jvm.target.validation.mode=warning` in `android/gradle.properties`. A background build's "completed" can hide
  a failed Gradle run: read the log's exit line.
- Buffer: 100 requests / 15 min, 10 scheduled posts; never post publicly without the user's go-ahead.
