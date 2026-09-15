import { NewProject } from "../new-project";
import { Preview } from "./preview";
import { Sky } from "./sections";

export default function Home() {
  return (
    <section className="relative isolate -mt-[4.25rem] overflow-hidden px-4 pt-[4.25rem] pb-24 sm:px-6 sm:pb-32">
      <Sky />
      <div className="mx-auto max-w-6xl pt-14 text-center sm:pt-20">
        <h1 className="mx-auto max-w-4xl text-[2.75rem] leading-[1.02] font-medium tracking-[-0.04em] sm:text-6xl lg:text-7xl">
          Turn one video into a month of content
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-[#2c3650] sm:text-xl">
          Paste a link or upload a video. Get captioned vertical clips, posts for every platform and a posting calendar.
        </p>
        <div className="mx-auto mt-9 max-w-2xl">
          <NewProject />
        </div>
      </div>
      <div className="rise mx-auto mt-16 max-w-5xl sm:mt-20" style={{ "--delay": "120ms" } as React.CSSProperties}>
        <Preview />
      </div>
    </section>
  );
}
