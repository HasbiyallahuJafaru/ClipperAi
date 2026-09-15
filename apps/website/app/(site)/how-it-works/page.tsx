import type { Metadata } from "next";
import { CtaBand, PageHero, Steps } from "../sections";

export const metadata: Metadata = {
  title: "How It Works: Turn a YouTube Video Into Shorts, TikToks and Reels",
  description: "Paste a link or upload a video, review the clips YT-Clipper finds, approve them and schedule a month of posts.",
  alternates: { canonical: "/how-it-works" },
};

export default function HowItWorks() {
  return (
    <>
      <PageHero title={<><span className="block">One video in.</span> <span className="block"><em>A month of posts out.</em></span></>}>
        The slow parts of short-form video, done for you. You review, approve and choose when things go out.
      </PageHero>
      <div className="mx-auto max-w-6xl px-4 pt-14 pb-24 sm:px-6 sm:pb-32"><Steps /></div>
      <CtaBand />
    </>
  );
}
