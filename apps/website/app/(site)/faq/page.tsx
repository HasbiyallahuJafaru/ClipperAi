import type { Metadata } from "next";
import { JsonLd } from "../../site";
import { Faq, QUESTIONS } from "../faq";
import { CtaBand, PageHero } from "../sections";

export const metadata: Metadata = {
  title: "FAQ: Watermarks, Credits, Cancelling and How AI Clips Work",
  description: "No watermark, no credits, one-click cancelling, failed videos don't count. How YT-Clipper picks clips, what it keeps and what it costs.",
  alternates: { canonical: "/faq" },
};

export default function FaqPage() {
  return (
    <>
      <JsonLd data={{
        "@context": "https://schema.org", "@type": "FAQPage",
        mainEntity: QUESTIONS.map(([name, text]) => ({ "@type": "Question", name, acceptedAnswer: { "@type": "Answer", text } })),
      }} />
      <PageHero title={<>Questions, <em>answered</em></>}>How YT-Clipper works, what it keeps and what it costs.</PageHero>
      <div className="mx-auto max-w-3xl px-4 pt-14 pb-24 sm:px-6 sm:pb-32"><Faq /></div>
      <CtaBand />
    </>
  );
}
