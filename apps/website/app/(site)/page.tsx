import { NewProject } from "../new-project";
import { PLANS } from "../plans";
import { DESCRIPTION, JsonLd, NAME, SITE } from "../site";
import { Preview } from "./preview";
import { Sky } from "./sections";

export default function Home() {
  return (
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
        <h1 className="mx-auto max-w-4xl text-[2.75rem] leading-[1.02] font-medium tracking-[-0.04em] sm:text-6xl lg:text-7xl">
          Turn one video into <em>a month of content</em>
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
