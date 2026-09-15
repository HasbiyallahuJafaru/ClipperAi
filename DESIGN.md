# Design system (website)

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

Type: Geist variable; headings medium (marketing) or semibold (app), tracking -0.03 to -0.04em. Montserrat ExtraBold
only for captions and hooks. Shadows: `shadow-card` (resting), `shadow-float` (hero preview, featured, popovers).

## Shape
Buttons, chips, nav: full pill. Fields: 12px. Cards: 16px (`card`). Panels, plan cards, marketing cards: 24px. Device
frames: larger, in em. Elevation is a shadow or a 1px ring, never both on the same box.

## Components (`globals.css` @layer components)
`btn` (+ `btn-primary`, `btn-ghost`, `btn-sm`, `btn-approve`; `aria-pressed` = ink fill, approve = blue), `input`,
`link`, `card`, `chip` (+ `chip-accent`, `chip-danger`), `skeleton`, `clip-frame` / `clip-caption` / `clip-hook`
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
