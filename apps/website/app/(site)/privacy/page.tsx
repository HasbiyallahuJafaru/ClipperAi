import type { Metadata } from "next";
import { PageHeader } from "@/app/ui";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What YT-Clipper collects, what it does with your videos and accounts, how long things are kept, and the choices you have.",
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

export default function PrivacyPage() {
  return (
    <article className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
      <PageHeader title="Privacy policy">Last updated {UPDATED}.</PageHeader>

      <Section title="The short version">
        <p>Your videos are yours, your social accounts stay yours, and we don&apos;t sell data or run ads. We collect
          what the product needs to work: your account details, the videos you give us, the clips we make from them,
          and the tokens you authorise so we can post for you. Everything is deleted on the schedules below, and you
          can ask us to delete your data at any time.</p>
      </Section>

      <Section title="Who we are">
        <p>YT-Clipper turns long videos into short clips (&quot;the service&quot;). For questions or requests about your
          data, contact <a className="link" href="mailto:support@ytclipper.xyz">support@ytclipper.xyz</a>.
          We answer within 30 days.</p>
      </Section>

      <Section title="What we collect">
        <ul className="list-disc grid gap-2 pl-5">
          <li><strong>Account details.</strong> When you sign in (by email code, Google or Apple), Clerk, our sign-in
            provider, gives us your email address, name and a unique account id. We never see your password.</li>
          <li><strong>Videos.</strong> The videos you upload and the links you paste, so we can make clips from them.</li>
          <li><strong>Transcripts and clips.</strong> The text transcript of your video and the clips we produce
            (video, caption file, thumbnail, titles and post copy).</li>
          <li><strong>Publishing connections.</strong> If you connect a social account through Buffer, we store the
            authorisation tokens Buffer gives us. We never see or store your social media passwords.</li>
          <li><strong>Billing records.</strong> Your plan, payment reference, amounts and the email your receipt goes
            to. Payments are handled by Paystack; <strong>we never receive or store card numbers</strong>.</li>
          <li><strong>Technical logs.</strong> Our hosting providers keep routine logs (which can include IP addresses)
            for security and reliability, and we keep per-connection rate-limiting counters to stop abuse.</li>
        </ul>
      </Section>

      <Section title="What we do with it, and why">
        <p>We process your data to provide the service you signed up for (creating, hosting and publishing your clips;
          billing), to keep the service secure and working, and to communicate with you about your account. We use AI
          providers to transcribe your video&apos;s audio and to draft clip titles and post copy from what is actually
          said in the video. We do not sell your data, we do not use your content to advertise to anyone, and we do not
          run tracking or advertising cookies — the only cookies are the ones that keep you signed in.</p>
      </Section>

      <Section title="Who we share it with">
        <p>Only the providers the product runs on, each processing data on our instructions:</p>
        <ul className="list-disc grid gap-2 pl-5">
          <li><strong>Clerk</strong> — accounts and sign-in.</li>
          <li><strong>Cloudflare</strong> — storage for your videos and clips.</li>
          <li><strong>Groq</strong> — speech-to-text of your video&apos;s audio.</li>
          <li><strong>DeepSeek</strong> — clip selection and post copy drafted from the transcript.</li>
          <li><strong>Buffer</strong> — publishes to the social accounts you connect.</li>
          <li><strong>Paystack (via the ZoomGuru payment API)</strong> — payment processing.</li>
          <li><strong>Railway and Vercel</strong> — application, database and website hosting.</li>
        </ul>
        <p>These providers have their own privacy policies, and their platforms&apos; own rules apply to anything you
          post to them. We may also disclose data where the law requires it.</p>
      </Section>

      <Section title="How long we keep things">
        <ul className="list-disc grid gap-2 pl-5">
          <li>Uploaded source videos: <strong>1 day</strong> after processing starts.</li>
          <li>Clips and project files: <strong>30 days</strong> from completion (you can download them any time before
            that).</li>
          <li>Copies made for scheduled social posts: <strong>45 days</strong> at most, deleted once a post is sent or
            cancelled.</li>
          <li>Transcripts: kept so the same video is never processed (and paid for) twice — deleted when the project is
            deleted or on your request.</li>
          <li>Account, billing and publishing-connection records: until you ask us to delete them (plus whatever we
            must keep for tax or legal reasons).</li>
        </ul>
      </Section>

      <Section title="Your choices and rights">
        <p>You can disconnect a social account any time (on the Integrations page or in Buffer), export your clips
          while they&apos;re stored, and ask us to delete your account and data by emailing us — we verify the request
          comes from you and complete it within 30 days. Depending on where you live (for example under the EU/UK GDPR
          or the Nigeria Data Protection Act), you may also have rights to access, correct, or restrict your data, to
          object to processing, and to complain to your data protection authority. We do not discriminate against you
          for using them.</p>
      </Section>

      <Section title="Security and where data lives">
        <p>Data travels encrypted, files are stored privately and shared only through short-lived signed links, social
          tokens are kept server-side and never in the apps, and processing is limited by your plan. Our hosting runs
          in the EU and the providers above operate globally, so your data may be processed in other countries under
          their safeguards.</p>
      </Section>

      <Section title="Children">
        <p>The service isn&apos;t for children under 13 (or the higher minimum age your country sets), and we don&apos;t
          knowingly collect their data. Tell us if you believe a child has an account and we&apos;ll remove it.</p>
      </Section>

      <Section title="Changes">
        <p>If this policy changes in a way that matters, we&apos;ll tell you in the app or by email before it takes
          effect. The date at the top always shows the current version.</p>
      </Section>
    </article>
  );
}
