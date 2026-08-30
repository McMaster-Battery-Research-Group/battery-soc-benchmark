import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PEOPLE, initialsOf, type Person } from "@/lib/people";
import { PageHeader, SectionTitle } from "@/components/ui/misc";

export const metadata: Metadata = { title: "About" };

/** Team list shown on the About page. Roles are kept short; edit here when people join or leave. */
function PersonCard({ p }: { p: Person }) {
  return (
    <li>
      <Link href={`/people/${p.slug}`} className="card flex items-center gap-4 p-4 transition-colors hover:border-maroon">
        {p.photo ? (
          <Image src={p.photo} alt={p.name} width={72} height={72} className="size-[72px] shrink-0 rounded-brand object-cover" />
        ) : (
          <span aria-hidden className="flex size-[72px] shrink-0 items-center justify-center rounded-brand bg-maroon-100 font-heading text-xl font-semibold text-maroon">{initialsOf(p.name)}</span>
        )}
        <div className="min-w-0">
          <p className="font-heading font-semibold text-ink">{p.name}</p>
          <p className="text-sm text-grey-700">{p.role}</p>
        </div>
      </Link>
    </li>
  );
}

export default function AboutPage() {
  return (
    <>
      <PageHeader eyebrow="About the project" title="An open, blinded benchmark from McMaster University" description="Developed by Dr. Phillip Kollmeyer's battery research group in the Department of Electrical and Computer Engineering so that state-of-charge estimation methods can finally be compared on equal terms — and to give students and industry a public, credible place to prove their algorithms." />
      <div className="container-site max-w-3xl space-y-12 py-10 text-[15px] leading-relaxed text-grey-800">
        <section>
          <SectionTitle>Why a blind modelling tool</SectionTitle>
          <p>Other fields have long relied on independent, comparative evaluation: the NIST Face Recognition Vendor Test or the PEER blind prediction contests in structural engineering. Battery state estimation had nothing equivalent — every paper used its own cells, cycles and metrics, and the author&apos;s effort on each baseline could unintentionally skew a comparison. This platform provides the dataset, the blinded test cases and the evaluator so that a lower number really does mean a better algorithm.</p>
        </section>
        <section>
          <SectionTitle>The lab</SectionTitle>
          <p>The benchmark is run by Dr. Phillip Kollmeyer&apos;s battery research group in the Department of Electrical and Computer Engineering at McMaster University (Hamilton, Ontario). The group works on battery modelling, state estimation and testing for electrified transportation. All data on this site was collected on an Arbin LBT cycler inside an Envirotronics SH16 thermal chamber.</p>
        </section>
        <section id="people" className="scroll-mt-24">
          <SectionTitle>People</SectionTitle>
          <ul className="grid gap-3 sm:grid-cols-2">
            {PEOPLE.filter((p) => p.group === "current").map((p) => <PersonCard key={p.slug} p={p} />)}
          </ul>
          <p className="mb-2 mt-6 font-heading text-xs font-semibold uppercase tracking-wide text-grey-600">Past contributors</p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {PEOPLE.filter((p) => p.group === "past").map((p) => <PersonCard key={p.slug} p={p} />)}
          </ul>
        </section>
        <section>
          <SectionTitle>Funding & acknowledgement</SectionTitle>
          <p>This work was supported by Canada&apos;s Natural Sciences and Engineering Research Council (NSERC) Discovery Grant RGPIN-2024-06796. We also acknowledge the support of McMaster University and thank the researchers who ran the multi-month test campaign behind the dataset.</p>
          <p className="mt-2 text-sm text-grey-600" lang="fr">Nous remercions le Conseil de recherches en sciences naturelles et en génie du Canada (CRSNG) de son soutien.</p>
          <div className="mt-5 flex flex-wrap items-center gap-8">
            <Image src="/logos/mcmaster.svg" alt="McMaster University" width={220} height={60} className="h-14 w-auto" />
            <Image src="/logos/nserc.svg" alt="NSERC / CRSNG" width={220} height={60} className="h-14 w-auto" />
          </div>
        </section>
      </div>
    </>
  );
}
