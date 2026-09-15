import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NewProject } from "../../../new-project";
import { JsonLd, NAME } from "../../../site";
import { Faq } from "../../faq";
import { CtaBand, PageHero, Steps } from "../../sections";
import { TOOLS } from "../data";

export const dynamicParams = false;
export const generateStaticParams = () => TOOLS.map(({ slug }) => ({ slug }));

export async function generateMetadata({ params }: PageProps<"/tools/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const tool = TOOLS.find((t) => t.slug === slug);
  if (!tool) return {};
  return { title: tool.title, description: tool.intro, alternates: { canonical: `/tools/${tool.slug}` } };
}

export default async function ToolPage({ params }: PageProps<"/tools/[slug]">) {
  const { slug } = await params;
  const tool = TOOLS.find((t) => t.slug === slug);
  if (!tool) notFound();

  return (
    <>
      <JsonLd data={{
        "@context": "https://schema.org", "@type": "FAQPage",
        mainEntity: tool.questions.map(([name, text]) => ({ "@type": "Question", name, acceptedAnswer: { "@type": "Answer", text } })),
      }} />
      <PageHero title={<>{tool.heading[0]}<em>{tool.heading[1]}</em></>} extra={<div className="mx-auto mt-9 max-w-2xl"><NewProject /></div>}>
        {tool.intro}
      </PageHero>
      <div className="mx-auto max-w-6xl px-4 pt-16 pb-16 sm:px-6">
        <h2 className="text-center text-3xl font-medium tracking-[-0.035em] sm:text-4xl">How the {NAME} {tool.keyword} works</h2>
        <div className="mt-10"><Steps /></div>
      </div>
      <div className="mx-auto max-w-3xl px-4 pb-24 sm:px-6 sm:pb-32">
        <h2 className="mb-6 text-center text-3xl font-medium tracking-[-0.035em]">Questions about the {tool.keyword}</h2>
        <Faq questions={tool.questions} />
      </div>
      <CtaBand />
    </>
  );
}
