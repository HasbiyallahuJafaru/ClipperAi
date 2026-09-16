# Design system (website and mobile app)

Written from the built site, 2026-09-15. Source of truth for values: `apps/website/app/globals.css`.

## World
Daylight SaaS after the user's "Relink" reference: sky photo behind page tops, pale cool grey ground, white surfaces,
one royal blue accent, near-black navy ink. Light only (user decision). No dark mode, no eyebrow labels.

## Tokens
| Role | Value | Use |
|---|---|---|
| ground | `#f4f6fa` | page background |
| surface | `#ffffff` | cards, bars, footer |
| ink | `#0a1022` | text, dark chips, phone frames |
| muted | `#5a6377` | secondary text (5.5:1 on ground) |
| line / line-strong | `#e5e8ef` / `#d3d9e3` | dividers / control outlines |
| accent / strong | `#2355f5` / `#1846dc` | primary buttons, active states, checks |
| accent-soft / accent-ink | `#ebf0ff` / `#1a3fb8` | tinted chips and panels, text on them |
| danger / soft | `#c0262d` / `#fdeeee` | errors, failed states |
| caption | `#ffe600` | spoken word in clip captions only |

Type: Geist variable; headings medium (marketing) or semibold (app), tracking -0.03 to -0.04em. Marketing headings put their key words in `<em>`: Instrument Serif Italic, 1.1em, accent blue (user's pick). Montserrat ExtraBold
only for captions. Shadows: `shadow-card` (resting), `shadow-float` (hero preview, featured, popovers).

## Shape
Buttons, chips, nav: full pill. Fields: 12px. Cards: 16px (`card`). Panels, plan cards, marketing cards: 24px. Device
frames: larger, in em. Elevation is a shadow or a 1px ring, never both on the same box.

## Components (`globals.css` @layer components)
`btn` (+ `btn-primary`, `btn-ghost`, `btn-sm`, `btn-approve`; `aria-pressed` = ink fill, approve = blue), `input`,
`link`, `card`, `chip` (+ `chip-accent`, `chip-danger`), `skeleton`, `clip-frame` / `clip-caption`
(engine caption style scaled by container width). Shared React: `Logo`, `PageHeader`, `ClipFrame`, `PAGES` (`app/ui.tsx`);
marketing sections in `app/(site)/sections.tsx`; `NetworkIcon` in `app/(app)/projects/[id]/publish.tsx`.

## Layouts
- Marketing (`app/(site)`): sticky glass pill header (current page in a white pill; phones get a menu), `PageHero` on
  the sky, content, closing sky `CtaBand`, white footer. Home = hero + composer + product preview only.
- App (`app/(app)`): white sidebar from `lg` (logo, New project, nav, account), top bar with scrolling tabs below `lg`;
  content max-w-5xl on ground, sections as white cards.

## Motion
Only where it shows the product: preview settles in once (`rise`), caption words light up in turn, the crop window pans,
dots flow along publishing lines. All off under `prefers-reduced-motion`.

## Placeholders to replace
Sample clip frames are gradients (`ClipFrame` tones) and sample project text is invented ("Weekly Build, episode 42").
Swap in frames from a video we have rights to.

## Mobile app (`apps/mobile`)
Follows the website's tokens, laid out for a phone (user's reference screenshot, 2026-09-16). Same hex values as
constants in `lib/main.dart` wired into one `ThemeData`: Geist 400/500/600 as static TTFs, pill buttons (48dp min),
12px fields, 16px cards, 24px panels and sheets, pale-blue selected states (`secondaryContainer` = accent-soft, never
Material's default teal). Icons are Phosphor (`phosphor_icons`), the same family as the website.

- **Welcome** (`welcome.dart`): the sky photo full-bleed, the logo on it, a white sheet curving over the bottom with
  *Continue with Google* (opens the phone's browser) and *Continue with email* (Clerk's card on the next screen).
- **Shell** (`home.dart`): four places behind a floating white bar with a blue indicator: Projects, Publishing, Plan,
  Account. Every page opens with `PageTop` (who is signed in, page actions). A page is built the first time it is
  opened, so unseen tabs cost no requests.
- **Projects** (`screens.dart`): heading, search, filter chips (All / Working / Ready / Stopped), then a two-column
  grid of picture tiles: the video's thumbnail, a state badge, a clip-count or percent pill, the site it came from and
  the date, a white progress bar while it runs.
- **Project**: state chip and start date, the picture filling up (`ClipLoading`) with the five steps while it works,
  a summary panel (Approve all, Calendar, Download all) and clip cards: video, chips, title, hook, description,
  per-platform post tabs with copy, file chips, review buttons, and the clip's posts.
- **Publishing / Plan / Account** (`account.dart`): Buffer's connection and channels; the plan, this month's meters,
  every plan and the billing history; the account with Clerk's own profile and workspaces screens. Plans and payment
  live on the website.
- Shared pieces in `ui.dart`: `Polling`, `StatusChip`, `ProgressBar`, `Message` (empty, error, finished), `Panel`,
  `SectionTitle`, `Skeleton`, `RoundButton`. Light only.
- **Seeing the screens without a phone:** `flutter test test/render.dart --update-goldens` writes every screen to
  `test/goldens/` with the real fonts and photo (not committed).
