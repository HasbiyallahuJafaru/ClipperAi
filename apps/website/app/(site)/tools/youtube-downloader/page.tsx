import type { Metadata } from "next";
import { JsonLd, NAME } from "../../../site";
import { Faq } from "../../faq";
import { CtaBand, PageHero, Steps } from "../../sections";
import { Downloader } from "../downloader";

export const metadata: Metadata = {
  title: "Free Video Downloader: YouTube, TikTok, Instagram and More, as MP4",
  description:
    "Paste a link from YouTube, TikTok, Instagram, X, Facebook, Reddit, Vimeo or Twitch and download the video as MP4, free. No account, no watermark — then turn it into clips from a link or your own upload.",
  alternates: { canonical: "/tools/youtube-downloader" },
};

const QUESTIONS: [string, string][] = [
  ["Is the downloader free?",
    "Yes. Looking up a video and downloading it costs nothing and needs no account. It's our free tool; the AI clip maker is the paid product."],
  ["What quality can I download?",
    "The best available up to 720p MP4, with the audio included. Fetching takes a moment because the file is prepared for you — you don't need any tools of your own."],
  ["Do I need to sign up or install anything?",
    "No. Paste the link, pick a quality and the download starts. It runs in your browser."],
  ["Which sites does it work with?",
    "YouTube, TikTok, Instagram, X, Facebook, Reddit, Vimeo, Dailymotion, Twitch, Pinterest and SoundCloud. Paste the page's normal link — the one you'd share."],
  ["Can I download private or paid videos?",
    "No. Only videos the site lets anyone watch without signing in can be downloaded."],
];

export default function YoutubeDownloaderPage() {
  return (
    <>
      <JsonLd data={{
        "@context": "https://schema.org", "@type": "FAQPage",
        mainEntity: QUESTIONS.map(([name, text]) => ({ "@type": "Question", name, acceptedAnswer: { "@type": "Answer", text } })),
      }} />
      <PageHero title={<>The free <em>video downloader</em></>}>
        Paste a link from YouTube, TikTok, Instagram, X, Facebook, Reddit, Vimeo, Twitch and more, and save the video
        as MP4. No sign-up, no watermark, and it never touches your plan — because it&apos;s simply free.
      </PageHero>
      <section className="mx-auto max-w-6xl px-4 pt-4 pb-16 sm:px-6">
        <Downloader />
      </section>
      <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <h2 className="text-center text-3xl font-medium tracking-[-0.035em] sm:text-4xl">Done downloading? Make it content</h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-muted">
          {NAME} turns a video into captioned Shorts, TikToks and Reels — with a post written for every platform.
          Give it a link from any site above, or upload the file you just saved.
        </p>
        <div className="mt-10"><Steps /></div>
      </div>
      <div className="mx-auto max-w-3xl px-4 pb-24 sm:px-6 sm:pb-32">
        <h2 className="mb-6 text-center text-3xl font-medium tracking-[-0.035em]">Downloader questions</h2>
        <Faq questions={QUESTIONS} />
      </div>
      <CtaBand />
    </>
  );
}
