import type { Metadata } from "next";
import Image from "next/image";
import { PageHeader, SectionTitle } from "@/components/ui/misc";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <>
      <PageHeader eyebrow="About the project" title="An open, blinded benchmark from the McMaster Automotive Resource Centre" description="Developed by Dr. Phillip Kollmeyer's battery research group so that state-of-charge estimation methods can finally be compared on equal terms — and to give students and industry a public, credible place to prove their algorithms." />
      <div className="container-site max-w-3xl space-y-12 py-10 text-[15px] leading-relaxed text-grey-800">
        <section>
          <SectionTitle>Why a blind modelling tool</SectionTitle>
          <p>Other fields have long relied on independent, comparative evaluation: the NIST Face Recognition Vendor Test or the PEER blind prediction contests in structural engineering. Battery state estimation had nothing equivalent — every paper used its own cells, cycles and metrics, and the author&apos;s effort on each baseline could unintentionally skew a comparison. This platform provides the dataset, the blinded test cases and the evaluator so that a lower number really does mean a better algorithm.</p>
        </section>
        <section>
          <SectionTitle>The lab</SectionTitle>
          <p>The McMaster Automotive Resource Centre (MARC) hosts the McMaster Energy Storage Laboratory: 17 cell-cycling channels up to 600 A, pack cycling to 1,000 V / 400 A, three thermal chambers and integrated gas sensing and fire suppression. All data on this site was collected there on an Arbin LBT cycler inside an Envirotronics SH16 chamber.</p>
          <p className="mt-3">Learn more at <a href="https://battery.mcmaster.ca/" className="text-maroon underline" target="_blank" rel="noreferrer">battery.mcmaster.ca</a> and <a href="https://electrification.mcmaster.ca" className="text-maroon underline" target="_blank" rel="noreferrer">electrification.mcmaster.ca</a>.</p>
        </section>
        <section>
          <SectionTitle>People</SectionTitle>
          <ul className="grid gap-3 sm:grid-cols-2">
            {[
              ["Dr. Phillip J. Kollmeyer", "Senior Principal Research Engineer; project lead"],
              ["Dr. Ali Emadi", "Canada Excellence Research Chair Laureate; MARC director"],
              ["Mina Naguib", "Data collection, evaluation tool"],
              ["Fauzia Khanum", "Data collection, dataset curation"],
            ].map(([n, r]) => (
              <li key={n} className="card p-4"><p className="font-heading font-semibold text-ink">{n}</p><p className="text-sm text-grey-700">{r}</p></li>
            ))}
          </ul>
        </section>
        <section>
          <SectionTitle>Funding & acknowledgement</SectionTitle>
          <p>This work is supported by McMaster University and the Natural Sciences and Engineering Research Council of Canada (NSERC). We thank the McMaster Automotive Resource Centre for laboratory access and the researchers who ran the multi-month test campaign.</p>
          <div className="mt-5 flex flex-wrap items-center gap-8">
            <Image src="/logos/mcmaster.svg" alt="McMaster University" width={220} height={60} className="h-14 w-auto" />
            <Image src="/logos/nserc.svg" alt="NSERC / CRSNG" width={220} height={60} className="h-14 w-auto" />
          </div>
        </section>
      </div>
    </>
  );
}
