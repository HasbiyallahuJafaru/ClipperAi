import Link from "next/link";

/** The mark: a vertical 9:16 clip on the accent square (same drawing as app/icon.svg). */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`inline-flex items-center gap-2 text-[17px] font-semibold tracking-[-0.02em] ${className}`}>
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="#2355f5" />
        <rect x="10.4" y="6" width="11.2" height="20" rx="2.5" fill="#fff" />
        <rect x="13" y="19.5" width="6" height="2.6" rx="1.3" fill="#2355f5" />
      </svg>
      YT-Clipper
    </Link>
  );
}

/** Title of a signed-in page, a line under it, and its actions on the right. */
export function PageHeader({ title, children, actions, back }: {
  title: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  back?: React.ReactNode; // a link above the title, back to where this page belongs
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        {back && <div className="mb-3 text-sm text-muted">{back}</div>}
        <h1 className="truncate text-3xl font-semibold tracking-[-0.03em] sm:text-[2.125rem]">{title}</h1>
        {children && <div className="mt-1.5 max-w-prose text-muted">{children}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

// Placeholder footage for sample clips (no video we own yet): soft light over cool tones. Replace with real clips.
const TONES = [
  "radial-gradient(ellipse 70% 45% at 50% 36%, rgb(255 255 255 / .34), transparent 70%), linear-gradient(165deg, #a9c1e2, #56709a 55%, #1d2a45)",
  "radial-gradient(ellipse 70% 45% at 46% 34%, rgb(255 255 255 / .3), transparent 70%), linear-gradient(165deg, #cfd6df, #8391a4 55%, #353f50)",
  "radial-gradient(ellipse 70% 45% at 54% 38%, rgb(255 255 255 / .3), transparent 70%), linear-gradient(165deg, #a8c3f0, #4b72c6 55%, #172858)",
  "radial-gradient(ellipse 70% 45% at 50% 35%, rgb(255 255 255 / .28), transparent 70%), linear-gradient(165deg, #bccacb, #6f8588 55%, #283638)",
];

/** A sample clip frame with the engine's caption style. `words`: one caption group; the spoken word moves along. */
export function ClipFrame({ tone = 0, words, className = "" }: {
  tone?: number;
  words: string[];
  className?: string;
}) {
  return (
    <div className={`clip-frame ${className}`} style={{ background: TONES[tone % TONES.length] }}>
      <p className="clip-caption">
        {words.map((word, i) => (
          <span key={i} className={`word ${i === 1 ? "word-on" : ""}`} style={{ "--i": i } as React.CSSProperties}>
            {word}{i < words.length - 1 ? " " : ""}
          </span>
        ))}
      </p>
    </div>
  );
}

/** A thin accent bar, 0-100. */
export function ProgressBar({ value, className = "" }: { value: number; className?: string }) {
  return (
    <div role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label="Progress"
         className={`h-1.5 overflow-hidden rounded-full bg-accent-soft ${className}`}>
      <div className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out" style={{ width: `${value}%` }} />
    </div>
  );
}

/** The source video's picture in a 9:16 clip frame that fills in from the bottom as the clips are made. */
export function ClipLoading({ src, progress, className = "w-36 sm:w-40" }: { src: string; progress: number; className?: string }) {
  return (
    <div className={`clip-frame shrink-0 rounded-2xl bg-ink shadow-card ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- remote thumbnail, any host */}
      <img src={src} alt="" className="absolute inset-0 size-full object-cover opacity-45 grayscale" />
      {/* eslint-disable-next-line @next/next/no-img-element -- same picture, full colour up to the progress */}
      <img src={src} alt="" className="absolute inset-0 size-full object-cover transition-[clip-path] duration-700 ease-out"
           style={{ clipPath: `inset(${100 - progress}% 0 0 0)` }} />
      <span className="absolute inset-x-0 bottom-3 text-center text-sm font-semibold text-white tabular-nums drop-shadow">{progress}%</span>
    </div>
  );
}

/** The marketing pages, in the site header and footer. */
export const PAGES = [["How it works", "/how-it-works"], ["Features", "/features"], ["Downloader", "/tools/youtube-downloader"], ["Pricing", "/pricing"], ["FAQ", "/faq"]];
