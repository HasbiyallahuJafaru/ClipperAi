import type { Metadata } from "next";
import { Plans } from "../plans";
import { PageHero } from "../sections";

export const metadata: Metadata = { title: "Pricing | ClipperAi" };

export default function Pricing() {
  return (
    <>
      <PageHero title={<>Choose your <em>plan</em></>} extra={
        <p className="mx-auto mt-6 w-fit rounded-full bg-white/80 px-4 py-2 text-sm font-medium text-accent-ink shadow-card">
          Payments are switched off during early access, so any plan is free for now. No card needed.
        </p>
      }>
        Every plan makes captioned vertical clips with posts for six platforms. Plans differ in how much you can make each month.
      </PageHero>
      <div className="mx-auto max-w-6xl px-4 pt-14 pb-24 sm:px-6 sm:pb-32"><Plans /></div>
    </>
  );
}
