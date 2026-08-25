import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/ui/misc";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = { title: "Contact & feedback" };

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ category?: string; subject?: string; from?: string }> }) {
  const sp = await searchParams;
  const session = await auth();
  return (
    <>
      <PageHeader eyebrow="Support" title="Contact & feedback" description="Questions, bug reports, ideas for the platform, contest eligibility, dataset issues — everything lands in the administrators\u2019 inbox and they are e-mailed immediately. We usually reply within two business days." />
      <div className="container-site grid gap-8 py-8 lg:grid-cols-3">
        <div className="lg:col-span-2"><ContactForm name={session?.user?.name ?? ""} email={session?.user?.email ?? ""} category={sp.category} subject={sp.subject} pageUrl={sp.from} /></div>
        <aside className="card p-5 text-sm text-grey-800">
          <p className="font-heading font-semibold text-ink">McMaster Automotive Resource Centre</p>
          <p className="mt-2">200 Longwood Road South<br />Hamilton, Ontario L8P 0A6<br />Canada</p>
          <p className="mt-4"><a href="https://electrification.mcmaster.ca" className="text-maroon underline" target="_blank" rel="noreferrer">electrification.mcmaster.ca</a></p>
          <p className="mt-4 text-xs text-grey-600">If the evaluator appears to be down (no result email within 24 h), mention your submission number in the message.</p>
        </aside>
      </div>
    </>
  );
}
