import { CheckCircle, WarningCircle } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd, NAME } from "../../../site";
import { CtaBand, PageHero } from "../../sections";
import { CHECKED, COMPETITORS, OURS } from "../data";

export const dynamicParams = false;
export const generateStaticParams = () => COMPETITORS.map(({ slug }) => ({ slug }));

export async function generateMetadata({ params }: PageProps<"/compare/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const competitor = COMPETITORS.find((c) => c.slug === slug);
  if (!competitor) return {};
  return {
    title: { absolute: `${competitor.name} Alternative: ${NAME} vs ${competitor.name} (${CHECKED})` },
    description: `${NAME} vs ${competitor.name}: pricing, what ${competitor.name} users complain about, and when each tool is the better pick.`,
    alternates: { canonical: `/compare/${slug}` },
  };
}

export default async function Compare({ params }: PageProps<"/compare/[slug]">) {
  const { slug } = await params;
  const them = COMPETITORS.find((c) => c.slug === slug);
  if (!them) notFound();

  return (
    <>
      <JsonLd data={{
        "@context": "https://schema.org", "@type": "FAQPage",
        mainEntity: them.complaints.map(([question, answer]) => ({
          "@type": "Question", name: `${question.replace(/\.$/, "")}: how does ${NAME} handle it?`,
          acceptedAnswer: { "@type": "Answer", text: answer },
        })),
      }} />
      <PageHero title={<>{NAME} vs {them.name}: <em>an honest comparison</em></>}>
        Looking for an alternative to {them.name}? Here is what each costs, what {them.name} users complain about, and when {them.name} is
        still the better pick. Checked {CHECKED}.
      </PageHero>

      <div className="mx-auto grid max-w-5xl gap-8 px-4 pt-14 pb-24 sm:px-6 sm:pb-32">
        <section className="card rounded-3xl p-6 sm:p-10">
          <h2 className="text-2xl font-semibold tracking-[-0.03em]">What {them.name} users complain about</h2>
          <p className="mt-2 text-muted">The most common problems in public reviews, and what {NAME} does instead.</p>
          <ul className="mt-8 grid gap-6">
            {them.complaints.map(([complaint, answer]) => (
              <li key={complaint} className="grid gap-3 sm:grid-cols-2 sm:gap-8">
                <p className="flex gap-3"><WarningCircle weight="fill" className="mt-0.5 size-5 shrink-0 text-danger" />{complaint}</p>
                <p className="flex gap-3"><CheckCircle weight="fill" className="mt-0.5 size-5 shrink-0 text-accent" />{answer}</p>
              </li>
            ))}
          </ul>
        </section>

        <div className="grid gap-8 md:grid-cols-2">
          <section className="card rounded-3xl p-6 sm:p-8">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">{them.name} pricing</h2>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <tbody className="divide-y divide-line">
                  {them.pricing.map(([plan, price, includes]) => (
                    <tr key={plan}>
                      <th scope="row" className="py-3 pr-4 font-medium">{plan}</th>
                      <td className="py-3 pr-4 whitespace-nowrap">{price}</td>
                      <td className="py-3 text-muted">{includes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-xs text-muted">Published prices as of {CHECKED}. Check {them.name}&apos;s site for current prices.</p>
          </section>

          <section className="card rounded-3xl p-6 sm:p-8">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">How {NAME} works</h2>
            <dl className="mt-5 divide-y divide-line text-sm">
              {OURS.map(([question, answer]) => (
                <div key={question} className="grid grid-cols-[9rem_1fr] gap-4 py-3">
                  <dt className="font-medium">{question}</dt>
                  <dd className="text-muted">{answer}</dd>
                </div>
              ))}
            </dl>
            <Link href="/pricing" className="link mt-4 inline-block text-sm font-medium">See {NAME} plans</Link>
          </section>
        </div>

        <section className="card rounded-3xl p-6 sm:p-10">
          <h2 className="text-2xl font-semibold tracking-[-0.03em]">When {them.name} is the better pick</h2>
          <ul className="mt-5 grid list-disc gap-2 pl-5 text-muted">
            {them.betterFor.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
          <p className="mt-6 text-muted">
            {NAME} is built for talking videos (podcasts, interviews, talks, webinars and YouTube videos), where the best
            moments are in what people say.
          </p>
        </section>

        <section className="text-sm text-muted">
          <h2 className="font-medium text-ink">Sources</h2>
          <ul className="mt-2 grid gap-1">
            {them.sources.map(([label, url]) => (
              <li key={url}><a href={url} className="link" rel="nofollow noopener" target="_blank">{label}</a></li>
            ))}
          </ul>
        </section>
      </div>
      <CtaBand />
    </>
  );
}
