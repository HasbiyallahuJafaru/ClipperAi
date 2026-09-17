import { NewProject } from "../new-project";
import { Reveal } from "../reveal";
import Link from "next/link";
import { PLANS } from "../plans";
import { DESCRIPTION, JsonLd, NAME, SITE } from "../site";
import { Preview } from "./preview";
import { CtaBand, FeatureGrid, PublishingMap, SectionHeading, Steps, Sky } from "./sections";

export default function Home() {
  return (
    <>
    <section className="relative isolate -mt-[4.25rem] overflow-hidden px-4 pt-[4.25rem] pb-24 sm:px-6 sm:pb-32">
      <JsonLd data={[
        { "@context": "https://schema.org", "@type": "Organization", name: NAME, url: SITE, logo: `${SITE}/icon.svg` },
        { "@context": "https://schema.org", "@type": "WebSite", name: NAME, url: SITE },
        {
          "@context": "https://schema.org", "@type": "SoftwareApplication", name: NAME, url: SITE, description: DESCRIPTION,
          applicationCategory: "MultimediaApplication", operatingSystem: "Web",
          offers: { "@type": "AggregateOffer", lowPrice: (Math.min(...PLANS.map((p) => p.price_cents)) / 100).toFixed(2),
            highPrice: (Math.max(...PLANS.map((p) => p.price_cents)) / 100).toFixed(2), priceCurrency: "USD" },
        },
      ]} />
      <Sky />
      <div className="mx-auto max-w-6xl pt-14 text-center sm:pt-20">
        <Reveal><h1 className="mx-auto max-w-4xl text-[2.75rem] leading-[1.02] font-medium tracking-[-0.04em] sm:text-6xl lg:text-7xl">
          Turn one video into <em>a month of content</em>
        </h1></Reveal>
        <Reveal delay={0.12}><p className="mx-auto mt-6 max-w-xl text-lg text-[#2c3650] sm:text-xl">
          Paste a link or upload a video. Get captioned vertical clips, posts for every platform and a posting calendar.
        </p></Reveal>
        <Reveal delay={0.24}><div className="mx-auto mt-9 max-w-2xl">
          <NewProject />
        </div></Reveal>
        <Reveal delay={0.32}><p className="mt-5 text-[15px] text-[#2c3650]">
          Just want the video?{" "}
          <Link href="/tools/youtube-downloader" className="font-medium text-accent-ink underline underline-offset-2">
            Use the free YouTube downloader
          </Link> — no sign-up, no plan needed.
        </p></Reveal>
      </div>
      <Reveal delay={0.1} className="mx-auto mt-16 max-w-5xl sm:mt-20">
        <Preview />
      </Reveal>
      <div className="mx-auto mt-24 max-w-6xl text-left sm:mt-32">
        <SectionHeading title={<>One video in, <em>a month of posts out</em></>}>
          Paste a link or upload a file. YT-Clipper reads the whole transcript, cuts the moments that stand on their
          own and writes the copy to go with them.
        </SectionHeading>
        <div className="mt-12"><Steps /></div>
        <div className="mt-24 sm:mt-32">
          <SectionHeading title={<>Everything a clip needs <em>before it goes out</em></>}>
            Captions, hooks, titles and a post for each platform — all yours to edit, and nothing is published until
            you approve it.
          </SectionHeading>
          <div className="mt-12"><FeatureGrid /></div>
        </div>
        <PublishingMap />
      </div>
    </section>
    <CtaBand />
    </>
  );
}
