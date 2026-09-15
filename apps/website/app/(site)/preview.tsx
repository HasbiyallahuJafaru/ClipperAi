import { CheckCircle, CreditCard, DownloadSimple, Plus, ShareNetwork, SquaresFour, Tag } from "@phosphor-icons/react/ssr";
import { ClipFrame } from "../ui";

// Sample project shown on the landing page. Illustrative content (no real customer), in the real review screen's layout.
const CLIPS = [
  { tone: 0, words: ["our", "first", "customers"], title: "How we found our first 100 customers", length: "0:42", approved: true },
  { tone: 2, words: ["nobody", "reads", "them"], title: "Why cold email stopped working", length: "0:55", approved: true },
  { tone: 1, words: ["start", "with", "one"], title: "A marketing plan for $0", length: "0:38", approved: false },
  { tone: 3, words: ["hire", "slowly,", "always"], title: "The hire we got wrong", length: "0:47", approved: true },
];

/** Everything inside is sized in em, and 1em is 1% of the preview's width, so it scales like a screenshot. */
export function Preview() {
  return (
    <div role="img" aria-label="A finished project in YT-Clipper: vertical clips with captions, ready to approve, schedule and download"
         className="[container-type:inline-size]">
      <div aria-hidden="true" className="relative pb-[4em] text-[1cqw]">
        <div className="ml-[18%] rounded-[2.2em] bg-white/80 p-[0.7em] shadow-float ring-1 ring-white backdrop-blur">
          <div className="grid grid-cols-[16em_1fr] overflow-hidden rounded-[1.6em] bg-ground ring-1 ring-line">
            <div className="flex flex-col gap-[0.5em] bg-white p-[1.4em]">
              <span className="mb-[1em] flex items-center gap-[0.5em] text-[1.3em] font-semibold tracking-[-0.02em]">
                <span className="grid size-[1.6em] place-items-center rounded-[0.4em] bg-accent">
                  <span className="h-[0.95em] w-[0.55em] rounded-[0.12em] bg-white" />
                </span>
                YT-Clipper
              </span>
              <span className="mb-[0.8em] flex h-[3em] items-center justify-center gap-[0.4em] rounded-full bg-accent text-[1.05em] font-medium text-white">
                <Plus weight="bold" className="size-[1em]" /> New project
              </span>
              {[[SquaresFour, "Projects", true], [ShareNetwork, "Publishing", false], [CreditCard, "Billing", false], [Tag, "Pricing", false]].map(([Icon, label, active]) => {
                const I = Icon as typeof SquaresFour;
                return (
                  <span key={label as string} className={`flex h-[2.8em] items-center gap-[0.7em] rounded-[0.8em] px-[0.9em] text-[1.05em] ${active ? "bg-accent-soft font-medium text-accent-ink" : "text-muted"}`}>
                    <I className="size-[1.2em]" /> {label as string}
                  </span>
                );
              })}
            </div>
            <div className="min-w-0 p-[2em]">
              <div className="flex items-start justify-between gap-[1em]">
                <div>
                  <p className="text-[1.9em] font-semibold tracking-[-0.03em]">Weekly Build, episode 42</p>
                  <p className="mt-[0.5em] flex gap-[0.5em] text-[1.05em]">
                    <span className="rounded-full bg-white px-[0.7em] py-[0.2em] text-muted ring-1 ring-line">6 clips</span>
                    <span className="rounded-full bg-accent-soft px-[0.7em] py-[0.2em] font-medium text-accent-ink">5 approved</span>
                  </p>
                </div>
                <div className="flex gap-[0.6em] text-[1.05em] font-medium">
                  <span className="flex h-[2.8em] items-center rounded-full bg-white px-[1.1em] ring-1 ring-line-strong">Schedule all</span>
                  <span className="flex h-[2.8em] items-center gap-[0.4em] rounded-full bg-accent px-[1.1em] text-white">
                    <DownloadSimple weight="bold" className="size-[1em]" /> Download all
                  </span>
                </div>
              </div>
              <div className="mt-[1.8em] grid grid-cols-4 gap-[1.2em]">
                {CLIPS.map((clip, i) => (
                  <div key={i} className="rounded-[1.1em] bg-white p-[0.6em] shadow-card">
                    <ClipFrame tone={clip.tone} words={clip.words} className="rounded-[0.7em]" />
                    <p className="mt-[0.7em] truncate px-[0.2em] text-[1.05em] font-medium">{clip.title}</p>
                    <p className="mt-[0.4em] flex items-center justify-between px-[0.2em] text-[0.95em] text-muted">
                      {clip.length}
                      {clip.approved ? (
                        <span className="flex items-center gap-[0.25em] font-medium text-accent-ink"><CheckCircle weight="fill" className="size-[1.1em]" /> Approved</span>
                      ) : <span>To review</span>}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 w-[20%] rotate-[-4deg] rounded-[3em] bg-ink p-[0.7em] shadow-float">
          <ClipFrame tone={2} words={["our", "first", "customers"]} className="rounded-[2.4em]" />
        </div>
      </div>
    </div>
  );
}
