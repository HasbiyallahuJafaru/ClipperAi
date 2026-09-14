import { NewProject } from "./new-project";

export default function Home() {
  return (
    <section className="pt-12 sm:pt-24">
      <h1 className="max-w-3xl font-display text-4xl leading-[1.05] tracking-tight text-balance sm:text-6xl">
        Turn one video into weeks of content.
      </h1>
      <p className="mt-5 max-w-xl text-lg text-muted">
        Paste a link or upload a video. You get vertical clips with captions, plus posts written for every platform.
      </p>
      <div className="mt-10">
        <NewProject />
      </div>
    </section>
  );
}
