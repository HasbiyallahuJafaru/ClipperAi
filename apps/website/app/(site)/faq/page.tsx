import type { Metadata } from "next";
import { Faq } from "../faq";
import { CtaBand, PageHero } from "../sections";

export const metadata: Metadata = { title: "FAQ | ClipperAi" };

export default function FaqPage() {
  return (
    <>
      <PageHero title="Questions, answered">How ClipperAi works, what it keeps and what it costs.</PageHero>
      <div className="mx-auto max-w-3xl px-4 pt-14 pb-24 sm:px-6 sm:pb-32"><Faq /></div>
      <CtaBand />
    </>
  );
}
