import type { Metadata } from "next";
import { PageHeader } from "@/app/ui";

export const metadata: Metadata = {
  title: "Terms and conditions",
  description: "The rules for using YT-Clipper: your content and ownership, plans and payments, publishing through your own social accounts, and what we do and don't promise.",
};

const UPDATED = "16 September 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10 max-w-3xl">
      <h2 className="text-xl font-semibold tracking-[-0.02em]">{title}</h2>
      <div className="mt-3 grid gap-3 text-[15px] leading-relaxed text-ink/85">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <article className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
      <PageHeader title="Terms and conditions">Last updated {UPDATED}. By using YT-Clipper you agree to these terms.</PageHeader>

      <Section title="What the service does">
        <p>YT-Clipper takes a video you give it (an upload or a public link) and uses automated processing — speech
          transcription, AI-assisted selection and copywriting, and automatic reframing and captioning — to produce
          short clips you can download and publish. We also let you schedule and publish approved clips to your own
          social media accounts through Buffer, acting on your explicit instruction and with your authorisation.</p>
      </Section>

      <Section title="Accounts">
        <p>You need an account to use the service. Keep your sign-in method secure; you&apos;re responsible for what
          happens through your account. One person or organization per account, and only you may use the plan you pay
          for.</p>
      </Section>

      <Section title="Your content and ownership">
        <p><strong>You keep ownership of everything you put in and everything we make for you</strong> — your videos,
          and the clips, titles, captions and post copy generated from them. You give us a limited licence to do the
          work: store, process, transcribe and (only where you connect an account and approve a clip) publish your
          content, for as long as it takes to provide the service and the retention periods in our privacy policy.
          We don&apos;t use your content for anything else and we don&apos;t train AI models on it.</p>
        <p>You confirm you have the rights to the videos you give us — your own material, or material you&apos;re
          licensed to use this way. Don&apos;t submit other people&apos;s videos without permission, and respect each
          platform&apos;s rules (including YouTube&apos;s) when you paste links.</p>
      </Section>

      <Section title="Acceptable use">
        <p>Don&apos;t use the service to process or publish content that is illegal, infringes anyone&apos;s rights,
          is hateful or harassing, sexual content involving minors, or anything else a reasonable platform would
          refuse. Don&apos;t try to break the service: no scraping, no bypassing plan limits or rate limits, no
          reselling access without an agreement, no uploading malware. We may suspend or end accounts that break
          these rules — and if your clips were already made, you keep access to download them where practical.</p>
      </Section>

      <Section title="Plans, payment and renewal">
        <p>Plans are described on the pricing page: what each includes (videos, minutes of video, clips per calendar
          month) and what it costs. Paying a plan gives you <strong>30 days</strong> of it from the day of payment.
          Nothing renews automatically and no card is stored: when the 30 days run out, you choose to pay again.
          Prices are shown in US dollars and charged in Naira at the exchange rate shown to you at checkout.</p>
        <p><strong>Refunds:</strong> if the service never processed anything for you because of a fault on our side,
          you get your money back. Because processing (transcription and rendering) starts immediately and consumes
          real costs, a plan isn&apos;t refundable simply because you changed your mind after videos were processed —
          unless your local law gives you a right we can&apos;t exclude. If a month turns out badly because the service
          didn&apos;t work as promised, contact us; we&apos;d rather make it right.</p>
      </Section>

      <Section title="Publishing through your accounts">
        <p>Publishing happens through your own connected accounts (currently via Buffer). When you approve a clip and
          choose channels, you instruct us to post that content on your behalf, and you&apos;re responsible for it —
          including that it complies with each platform&apos;s terms and any disclosure your audience or the law
          requires. You can disconnect us at any time, in the app or in Buffer; disconnecting stops future posts (a
          scheduled post already handed over may still go out — unschedule it first if you don&apos;t want that).</p>
      </Section>

      <Section title="AI output">
        <p>Clip selection, titles, hooks and post copy are drafted automatically from your transcript. They&apos;re a
          strong first draft, not a guarantee: review them before you publish (the app makes that easy), and don&apos;t
          rely on the service for legal, medical or financial advice or content where factual accuracy must be
          certified.</p>
      </Section>

      <Section title="Availability and changes">
        <p>We work hard to keep the service available, but we promise it &quot;as is&quot; and &quot;as
          available&quot;: processing depends on third parties (speech-to-text, AI, storage, hosting, and the social
          platforms themselves), and we may change or discontinue features. If we change these terms in a way that
          matters to you, we&apos;ll tell you in the service or by email before it takes effect; continuing to use
          the service after that means you accept the new terms.</p>
      </Section>

      <Section title="Limitation of liability">
        <p>To the fullest extent the law allows, YT-Clipper isn&apos;t liable for indirect or consequential losses
          (lost profits, audience, data you didn&apos;t store, and the like). Our total liability for any claim is
          capped at the amount you paid us in the 12 months before it arose. Nothing here excludes liability that
          can&apos;t legally be excluded — for anything where the law holds us responsible regardless, you keep that
          right. You agree to cover us against claims from other people about content you chose to process or publish
          through the service.</p>
      </Section>

      <Section title="Ending the service">
        <p>You can stop using the service any time and ask us to delete your data (see the privacy policy). We may
          end or suspend accounts for breach of these terms, non-payment, or if we must for legal reasons — with
          notice where we can give it. If we shut the service down for good, we&apos;ll give you reasonable notice to
          download your clips.</p>
      </Section>

      <Section title="Law and contact">
        <p>These terms are governed by the laws of the Federal Republic of Nigeria, and the courts of Nigeria have
          jurisdiction — without taking away any consumer rights your local law grants you that we can&apos;t exclude.
          Questions, disputes or takedown requests: <a className="link" href="mailto:support@ytclipper.xyz">support@ytclipper.xyz</a>.
          Our privacy policy at <a className="link" href="/privacy">/privacy</a> describes how we handle your data and
          forms part of these terms.</p>
      </Section>
    </article>
  );
}
