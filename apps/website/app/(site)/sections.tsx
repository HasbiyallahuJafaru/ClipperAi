import { Show } from "@clerk/nextjs";
import {
  ArrowRight, CheckCircle, FacebookLogo, FileCsv, FileZip, Folder, InstagramLogo, LinkedinLogo, Scissors, Sparkle,
  TiktokLogo, UploadSimple, XLogo, YoutubeLogo,
} from "@phosphor-icons/react/ssr";
import Image from "next/image";
import Link from "next/link";
import { ClipFrame } from "../ui";
import sky from "./sky.jpg";

const NETWORKS = [
  [TiktokLogo, "TikTok"], [InstagramLogo, "Instagram"], [YoutubeLogo, "YouTube"],
  [LinkedinLogo, "LinkedIn"], [FacebookLogo, "Facebook"], [XLogo, "X"],
] as const;

/** Sky photo (Unsplash, free licence: see DECISIONS.md) washed toward the page's ground so type stays readable. */
export function Sky({ className = "absolute inset-0", position = "50% 30%" }: { className?: string; position?: string }) {
  return (
    <div aria-hidden="true" className={`-z-10 ${className}`}>
      <Image src={sky} alt="" fill loading="eager" fetchPriority="high" sizes="100vw" className="object-cover" style={{ objectPosition: position }} />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_55%_45%_at_50%_28%,rgb(255_255_255/.6),transparent_75%),linear-gradient(180deg,rgb(244_246_250/.1)_0%,rgb(244_246_250/.35)_45%,#f4f6fa_92%)]" />
    </div>
  );
}

/** The top of every marketing page below the home page: title and one sentence on the sky. */
export function PageHero({ title, children, extra }: { title: React.ReactNode; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <section className="relative isolate -mt-[4.25rem] overflow-hidden px-4 pt-[4.25rem] sm:px-6">
      <Sky className="absolute inset-x-0 top-0 h-[36rem]" position="50% 20%" />
      <div className="mx-auto max-w-4xl pt-16 pb-4 text-center sm:pt-24">
        <h1 className="text-[2.6rem] leading-[1.04] font-medium tracking-[-0.04em] sm:text-6xl">{title}</h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-[#2c3650] sm:text-xl">{children}</p>
        {extra}
      </div>
    </section>
  );
}

function SectionHeading({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <h2 className="text-4xl leading-[1.08] font-medium tracking-[-0.035em] sm:text-5xl">{title}</h2>
      <p className="mt-4 text-lg text-muted">{children}</p>
    </div>
  );
}

export function Steps() {
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.15fr_1fr]">
      <article className="card flex flex-col rounded-3xl p-6">
        <h2 className="flex items-center gap-3 text-lg font-semibold tracking-[-0.02em]">
          <span className="grid size-9 place-items-center rounded-full bg-accent text-white"><Sparkle weight="fill" className="size-4" /></span>
          Finds the moments
        </h2>
        <p className="mt-3 text-muted">It reads the whole transcript and picks the parts that stand on their own, each with a hook and a title.</p>
        <div className="mt-6 flex-1 rounded-2xl bg-ground p-4 text-[13px] leading-relaxed text-muted" aria-hidden="true">
          <p>...so we tried everything the playbooks said. Paid ads, a launch, a waitlist.</p>
          <div className="my-2.5 rounded-xl bg-surface p-3 text-ink shadow-card">
            <p className="flex flex-wrap items-center gap-2 text-[12px] font-medium text-accent-ink">
              <span className="chip chip-accent min-h-5 px-2 text-[12px]">18:40 to 19:35</span> Clip 02
            </p>
            <p className="mt-2">Nobody reads them. What worked was answering questions where our buyers already were.</p>
            <p className="mt-2 w-fit bg-ink px-1.5 py-0.5 font-caption text-[11px] text-white">Stop sending cold emails</p>
          </div>
          <p>And that is how the first hundred customers came in, one thread at a time.</p>
        </div>
      </article>

      <article className="flex flex-col rounded-3xl bg-accent p-6 text-white shadow-float">
        <h2 className="flex items-center gap-3 text-lg font-semibold tracking-[-0.02em]">
          <span className="grid size-9 place-items-center rounded-full bg-white text-accent"><Scissors weight="fill" className="size-4" /></span>
          Cuts, frames and captions
        </h2>
        <p className="mt-3 text-white/90">Every clip is cut to 9:16, keeps the speaker&apos;s face in frame and captions each word as it&apos;s said.</p>
        <div className="relative mt-6 min-h-56 flex-1 overflow-hidden rounded-2xl bg-[radial-gradient(ellipse_40%_60%_at_50%_40%,rgb(255_255_255/.25),transparent_70%),linear-gradient(160deg,#6c8fd8,#233f8f_60%,#0f1d4a)]" aria-hidden="true">
          <div className="pan absolute inset-y-0 left-[22%] aspect-[9/16] [--pan:105%]">
            <div className="absolute inset-0 rounded-md shadow-[0_0_0_999px_rgb(10_16_34/.45)] ring-2 ring-white" />
            <div className="absolute inset-x-[18%] top-[26%] aspect-square rounded-lg border-2 border-dashed border-white/80" />
            <ClipFrame words={["every", "word", "counts"]} className="!absolute inset-0 !bg-none" />
          </div>
        </div>
      </article>

      <article className="card flex flex-col rounded-3xl p-6">
        <h2 className="flex items-center gap-3 text-lg font-semibold tracking-[-0.02em]">
          <span className="grid size-9 place-items-center rounded-full bg-accent text-white"><ArrowRight weight="bold" className="size-4 -rotate-45" /></span>
          Writes and schedules posts
        </h2>
        <p className="mt-3 text-muted">A post for each platform, then your approved clips posted automatically
          through your own Buffer account — spread over the days and times you pick. We never see your passwords.</p>
        <div className="mt-6 grid flex-1 grid-cols-5 content-start gap-1.5 rounded-2xl bg-ground p-3 text-center text-[12px]" aria-hidden="true">
          {([["Mon", [TiktokLogo, YoutubeLogo]], ["Tue", []], ["Wed", [InstagramLogo]], ["Thu", [LinkedinLogo, XLogo]], ["Fri", [TiktokLogo]]] as const).map(([day, icons]) => (
            <div key={day} className="grid content-start gap-1.5">
              <span className="py-1 font-medium text-muted">{day}</span>
              {icons.map((Icon, i) => (
                <span key={i} className="grid h-14 place-items-center rounded-lg bg-surface shadow-card">
                  <Icon weight="fill" className="size-4 text-ink" />
                </span>
              ))}
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}

export function FeatureGrid() {
  return (
    <div className="grid gap-5 lg:grid-cols-6">
      <article className="relative overflow-hidden rounded-3xl bg-[linear-gradient(180deg,#e6edff,#f4f7ff)] p-7 lg:col-span-3 lg:row-span-2">
        <h2 className="text-xl font-semibold tracking-[-0.02em]">Captions that follow every word</h2>
        <p className="mt-2 max-w-md text-muted">A few words at a time with the spoken word highlighted. Turn them off for videos that already have their own.</p>
        <div className="mx-auto mt-8 w-[58%] max-w-64 translate-y-10 rounded-[2.2rem] bg-ink p-2 shadow-float sm:w-[46%]" aria-hidden="true">
          <ClipFrame tone={0} words={["our", "first", "customers"]} className="rounded-[1.7rem]" />
        </div>
      </article>

      <article className="rounded-3xl bg-surface p-7 shadow-card lg:col-span-3">
        <h2 className="text-xl font-semibold tracking-[-0.02em]">A post written for each platform</h2>
        <p className="mt-2 text-muted">Different length, tone and hashtags for each network. Edit any of it before you approve.</p>
        <div className="mt-6 rounded-2xl bg-ground p-4" aria-hidden="true">
          <div className="flex flex-wrap gap-1.5">
            {NETWORKS.map(([Icon, name], i) => (
              <span key={name} className={`chip ${i === 3 ? "bg-ink text-white" : "bg-surface"}`}><Icon weight="fill" className="size-3.5" /> {name}</span>
            ))}
          </div>
          <p className="mt-4 text-[15px] leading-relaxed">
            Our first 100 customers didn&apos;t come from ads. They came from answering questions in the places our buyers
            already spent time. Here is what that looked like week by week.
          </p>
          <p className="mt-2 text-[15px] text-accent-ink">#startups #growth #founders</p>
        </div>
      </article>

      <article className="rounded-3xl bg-surface p-7 shadow-card lg:col-span-3">
        <h2 className="text-xl font-semibold tracking-[-0.02em]">Nothing goes out until you approve it</h2>
        <p className="mt-2 text-muted">Keep the clips you like, reject the rest. Only approved clips can be posted or scheduled.</p>
        <div className="mt-6 flex items-center gap-4 rounded-2xl bg-ground p-3" aria-hidden="true">
          <ClipFrame tone={1} words={["start", "with", "one"]} className="w-14 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">A marketing plan for $0</p>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[13px] font-medium">
              <span className="flex h-8 items-center gap-1 rounded-full bg-accent px-3 text-white"><CheckCircle weight="fill" className="size-4" /> Approved</span>
              <span className="flex h-8 items-center rounded-full bg-surface px-3 ring-1 ring-line-strong">Reject</span>
              <span className="flex h-8 items-center rounded-full bg-surface px-3 ring-1 ring-line-strong">Edit</span>
            </div>
          </div>
        </div>
      </article>

      <article className="rounded-3xl bg-ink p-7 text-white lg:col-span-4">
        <div className="grid gap-8 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Download it all in one file</h2>
            <p className="mt-2 max-w-sm text-white/75">Clips, caption files, thumbnails and a spreadsheet of every title, post and scheduled time.</p>
          </div>
          <ul className="grid gap-1.5 rounded-2xl bg-white/[.07] p-4 text-[13px] text-white/85 ring-1 ring-white/10" aria-label="What's in the download">
            <li className="flex items-center gap-2 font-medium text-white"><FileZip weight="fill" className="size-4 text-[#8fb0ff]" /> content-package.zip</li>
            {["videos", "captions", "thumbnails"].map((folder) => (
              <li key={folder} className="flex items-center gap-2 pl-5"><Folder weight="fill" className="size-4 text-white/60" /> {folder}/</li>
            ))}
            <li className="flex items-center gap-2 pl-5"><FileCsv weight="fill" className="size-4 text-white/60" /> clips.csv</li>
            <li className="flex items-center gap-2 pl-5"><FileCsv weight="fill" className="size-4 text-white/60" /> calendar.csv</li>
          </ul>
        </div>
      </article>

      <article className="rounded-3xl bg-surface p-7 shadow-card lg:col-span-2">
        <h2 className="text-xl font-semibold tracking-[-0.02em]">Many videos at once</h2>
        <p className="mt-2 text-muted">Paste a list of links or drop several files, up to 5 GB each.</p>
        <ul className="mt-6 grid gap-2 text-[13px]" aria-hidden="true">
          {[["episode-41.mp4", "Ready"], ["episode-42.mp4", "Making clips"], ["episode-43.mp4", "Uploading, 64%"]].map(([name, state], i) => (
            <li key={name} className="flex items-center gap-2 rounded-xl bg-ground px-3 py-2.5">
              <UploadSimple weight="bold" className="size-3.5 text-muted" />
              <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
              <span className={i === 0 ? "font-medium text-accent-ink" : "text-muted"}>{state}</span>
            </li>
          ))}
        </ul>
      </article>
    </div>
  );
}

/** Clip -> Buffer -> six networks, with posts flowing along the lines. */
export function PublishingMap() {
  return (
    <section className="mt-24 sm:mt-32">
      <SectionHeading title={<>Post to six platforms <em>from one place</em></>}>
        Connect your accounts in Buffer, then post a clip now or schedule it up to 30 days ahead.
      </SectionHeading>
      <div className="relative mx-auto mt-12 aspect-[1000/380] max-w-4xl min-w-0" aria-hidden="true">
        <svg viewBox="0 0 1000 380" className="absolute inset-0 size-full" fill="none">
          <path d="M500 108 V170" stroke="#c9d3e6" strokeWidth="2" />
          {NETWORKS.map((_, i) => {
            const x = 90 + i * 164;
            return (
              <g key={i}>
                <path id={`branch-${i}`} d={`M500 222 C500 280 ${x} 250 ${x} 300`} stroke="#c9d3e6" strokeWidth="2" />
                <circle r="5" fill="#2355f5" className="flow-dot">
                  <animateMotion dur="2.8s" begin={`${i * 0.35}s`} repeatCount="indefinite"><mpath href={`#branch-${i}`} /></animateMotion>
                </circle>
              </g>
            );
          })}
        </svg>
        <div className="absolute top-[14%] left-1/2 grid w-[11%] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[22%] bg-accent p-[2.2%] shadow-float">
          <svg viewBox="0 0 32 32" className="w-full"><rect x="10.4" y="6" width="11.2" height="20" rx="2.5" fill="#fff" /><rect x="13" y="19.5" width="6" height="2.6" rx="1.3" fill="#2355f5" /></svg>
        </div>
        <div className="absolute top-[51.5%] left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface px-[2.2%] py-[1%] text-[clamp(11px,1.6vw,15px)] font-medium whitespace-nowrap shadow-card ring-1 ring-line">
          via Buffer
        </div>
        {NETWORKS.map(([Icon, name], i) => (
          <span key={name} className="absolute top-[85%] grid aspect-square w-[11%] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[26%] bg-surface shadow-card ring-1 ring-line sm:w-[9.5%]"
                style={{ left: `${9 + i * 16.4}%` }}>
            <Icon weight="fill" className="size-[46%]" />
          </span>
        ))}
      </div>
      <ul className="mx-auto mt-12 grid max-w-4xl gap-4 text-[15px] sm:grid-cols-3">
        {["Each network gets its own post", "Post now or schedule for later", "We never see your passwords"].map((fact) => (
          <li key={fact} className="flex items-center justify-center gap-2 font-medium">
            <CheckCircle weight="fill" className="size-5 text-accent" /> {fact}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The closing band: sky, one line and the sign-up (or new project) button. */
export function CtaBand() {
  return (
    <section className="px-4 pb-24 sm:px-6">
      <div className="relative isolate mx-auto grid max-w-6xl overflow-hidden rounded-[2rem] px-6 pt-14 sm:px-14 md:grid-cols-[1.3fr_1fr] md:pt-0">
        <div aria-hidden="true" className="absolute inset-0 -z-10">
          <Image src={sky} alt="" fill sizes="(min-width: 1152px) 1152px, 100vw" className="object-cover object-[50%_65%]" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgb(255_255_255/.78),rgb(255_255_255/.35)_60%,rgb(255_255_255/.05))]" />
        </div>
        <div className="self-center md:py-20">
          <h2 className="max-w-md text-4xl leading-[1.06] font-medium tracking-[-0.035em] sm:text-5xl">Your next month of posts is <em>already recorded</em></h2>
          <p className="mt-4 max-w-sm text-lg text-[#2c3650]">Paste a link and review your first clips today.</p>
          <Show when="signed-out"><Link href="/sign-up" className="btn btn-primary mt-8 h-12 px-6">Sign up</Link></Show>
          <Show when="signed-in"><Link href="/projects/new" className="btn btn-primary mt-8 h-12 px-6">New project</Link></Show>
        </div>
        <div className="relative mx-auto mt-12 h-72 w-56 md:mt-0 md:h-auto md:w-full" aria-hidden="true">
          <div className="absolute top-[12%] left-1/2 w-56 -translate-x-1/2 rotate-[5deg] rounded-[2.4rem] bg-ink p-2 shadow-float md:w-60">
            <ClipFrame tone={2} words={["nobody", "reads", "them"]} className="rounded-[1.9rem]" />
          </div>
        </div>
      </div>
    </section>
  );
}
