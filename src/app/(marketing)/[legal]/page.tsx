import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/misc";

const PAGES: Record<string, { title: string; body: { h: string; p: string[] }[] }> = {
  terms: {
    title: "Terms of use",
    body: [
      { h: "Use of the service", p: ["The Battery SOC Benchmark is provided by the McMaster Automotive Resource Centre at McMaster University for research and educational purposes. By creating an account you agree to use the service for evaluating battery state-of-charge estimation models and for no other purpose."] },
      { h: "Submissions", p: ["You confirm that models you submit were developed only with the open portion of the dataset or other public data, and that you hold the rights to the code you upload. Uploaded packages are used solely to run the evaluation and are deleted afterwards. Model names, authors, affiliations and evaluation results of public submissions are displayed on the site and may be used in aggregate in publications about the benchmark.", "Attempts to reconstruct, infer or exfiltrate the blinded data, to interfere with the evaluator, or to submit malicious code will result in removal of the account."] },
      { h: "Data licence", p: ["The open dataset is released under CC-BY 4.0. Publications using the data or evaluation results must cite the ITEC 2022 paper and the Borealis dataset."] },
      { h: "No warranty", p: ["The service is provided as is. McMaster University makes no warranty of availability or fitness for any purpose and is not liable for any loss arising from its use."] },
    ],
  },
  privacy: {
    title: "Privacy",
    body: [
      { h: "What we store", p: ["Your name, email address, affiliation and a salted password hash; any optional profile details you choose to add (position, short bio, profile picture, and links such as LinkedIn, ORCID, Google Scholar, ResearchGate, GitHub or a website); the metadata and results of your submissions; messages you send through the contact form; and server logs used for security and troubleshooting."] },
      { h: "What is public", p: ["For public submissions: model name, description, model type, author name, affiliation, submission date and evaluation results. Optional profile details and your picture appear on your public researcher page and next to your public submissions; you can remove them at any time from your profile. Private submissions and your email address are never shown to other users."] },
      { h: "Model files", p: ["Uploaded submission packages are stored only until the evaluation has run and are then deleted. They are not shared with third parties."] },
      { h: "Email", p: ["We email you only for account verification, password resets, evaluation results and contest administration."] },
      { h: "Contact", p: ["For questions or deletion requests use the contact form or email the McMaster Automotive Resource Centre."] },
    ],
  },
  accessibility: {
    title: "Accessibility",
    body: [
      { h: "Our commitment", p: ["McMaster University is committed to providing digital services that are accessible to everyone in accordance with the Accessibility for Ontarians with Disabilities Act (AODA) and WCAG 2.2 AA. This site uses semantic HTML, keyboard-operable controls, visible focus indicators, sufficient colour contrast and text alternatives for charts (every chart has an equivalent table or CSV)."] },
      { h: "Report a problem", p: ["If you encounter a barrier, tell us through the contact form and include the page and the assistive technology you were using. We aim to respond within five business days."] },
    ],
  },
};

export function generateStaticParams() {
  return Object.keys(PAGES).map((legal) => ({ legal }));
}

export async function generateMetadata({ params }: { params: Promise<{ legal: string }> }): Promise<Metadata> {
  const page = PAGES[(await params).legal];
  return { title: page?.title ?? "Not found" };
}

export default async function LegalPage({ params }: { params: Promise<{ legal: string }> }) {
  const page = PAGES[(await params).legal];
  if (!page) notFound();
  return (
    <>
      <PageHeader title={page.title} description="Last updated August 2026." />
      <article className="container-site max-w-3xl space-y-8 py-10 text-[15px] leading-relaxed text-grey-800">
        {page.body.map((s) => (
          <section key={s.h}>
            <h2 className="font-heading text-xl font-bold">{s.h}</h2>
            {s.p.map((p, i) => <p key={i} className="mt-2">{p}</p>)}
          </section>
        ))}
      </article>
    </>
  );
}
