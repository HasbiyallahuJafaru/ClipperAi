import type { Metadata } from "next";
import { CtaBand, FeatureGrid, PageHero, PublishingMap } from "../sections";

export const metadata: Metadata = { title: "Features | ClipperAi" };

export default function Features() {
  return (
    <>
      <PageHero title={<>Everything a clip needs <em>before it goes out</em></>}>
        From the first word on screen to the file on your drive.
      </PageHero>
      <div className="mx-auto max-w-6xl px-4 pt-14 pb-24 sm:px-6 sm:pb-32">
        <FeatureGrid />
        <PublishingMap />
      </div>
      <CtaBand />
    </>
  );
}
