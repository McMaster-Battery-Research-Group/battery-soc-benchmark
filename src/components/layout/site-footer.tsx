import Link from "next/link";
import Image from "next/image";
import { Wordmark } from "./logo";

const COLS = [
  {
    title: "Benchmark",
    links: [
      { href: "/leaderboard", label: "Leaderboard" },
      { href: "/compare", label: "Compare models" },
      { href: "/contest", label: "Contest" },
      { href: "/submit", label: "Submit a model" },
    ],
  },
  {
    title: "Learn",
    links: [
      { href: "/getting-started", label: "Get started" },
      { href: "/examples", label: "Example models" },
      { href: "/dataset", label: "Dataset" },
      { href: "/docs", label: "Methodology" },
      { href: "/glossary", label: "Glossary" },
      { href: "/help", label: "Help & FAQ" },
    ],
  },
  {
    title: "About",
    links: [
      { href: "/about", label: "About the project" },
      { href: "https://battery.mcmaster.ca/", label: "McMaster Battery Lab", external: true },
      { href: "https://www.eng.mcmaster.ca/ece/faculty/dr-phil-kollmeyer/", label: "Dr. Phillip Kollmeyer", external: true },
      { href: "/contact", label: "Contact & feedback" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border bg-grey-100/70">
      <div className="container-site grid gap-10 py-12 md:grid-cols-12">
        <div className="md:col-span-4">
          <Wordmark />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-grey-700">
            A standardized, blinded evaluation platform for battery state-of-charge estimation algorithms, developed by
            Dr. Phillip Kollmeyer&apos;s battery research group at McMaster University.
          </p>
        </div>
        {COLS.map((c) => (
          <div key={c.title} className="md:col-span-2">
            <p className="font-heading text-sm font-semibold text-ink">{c.title}</p>
            <ul className="mt-3 space-y-2 text-sm">
              {c.links.map((l) => (
                <li key={l.href}>
                  {l.external ? (
                    <a href={l.href} target="_blank" rel="noreferrer" className="text-grey-700 hover:text-maroon hover:underline">{l.label}</a>
                  ) : (
                    <Link href={l.href} className="text-grey-700 hover:text-maroon hover:underline">{l.label}</Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="md:col-span-2">
          <p className="font-heading text-sm font-semibold text-ink">Cite</p>
          <p className="mt-3 text-xs leading-relaxed text-grey-700">
            P. J. Kollmeyer, M. Naguib, F. Khanum, A. Emadi, “A Blind Modeling Tool for Standardized Evaluation of Battery State of Charge Estimation Algorithms,” <em>IEEE ITEC+EATS</em>, 2022.{" "}
            <a href="https://doi.org/10.1109/ITEC53557.2022.9813996" className="text-maroon underline" target="_blank" rel="noreferrer">doi:10.1109/ITEC53557.2022.9813996</a>
          </p>
        </div>
      </div>

      <FundingAcknowledgement />

      <div className="border-t border-border">
        <div className="container-site flex flex-col gap-3 py-5 text-xs text-grey-600 md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} McMaster University · Department of Electrical and Computer Engineering, 1280 Main Street West, Hamilton, Ontario L8S 4L8</p>
          <div className="flex flex-wrap gap-4">
            <Link href="/terms" className="hover:text-maroon hover:underline">Terms of use</Link>
            <Link href="/privacy" className="hover:text-maroon hover:underline">Privacy</Link>
            <Link href="/accessibility" className="hover:text-maroon hover:underline">Accessibility</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

/**
 * Funding & institutional acknowledgement. Logo files are placeholders — replace
 * public/logos/mcmaster.svg and public/logos/nserc.svg with the official assets
 * supplied by the lab (McMaster Brand Marketing / NSERC acknowledgement logos).
 */
export function FundingAcknowledgement() {
  return (
    <div className="border-t border-border bg-white">
      <div className="container-site flex flex-col items-start gap-6 py-8 md:flex-row md:items-center md:justify-between">
        <div className="max-w-xl">
          <p className="font-heading text-xs font-semibold uppercase tracking-[0.14em] text-maroon">Supported by</p>
          <p className="mt-2 text-sm leading-relaxed text-grey-700">
            This benchmark is developed by Dr. Phillip Kollmeyer&apos;s battery research group at McMaster University. This work was supported by Canada&apos;s Natural Sciences and Engineering Research Council (NSERC) Discovery Grant RGPIN-2024-06796.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-8">
          <a href="https://www.mcmaster.ca" target="_blank" rel="noreferrer" aria-label="McMaster University" className="shrink-0">
            <Image src="/logos/mcmaster.svg" alt="McMaster University" width={200} height={56} className="h-12 w-auto" />
          </a>
          <a href="https://www.nserc-crsng.gc.ca" target="_blank" rel="noreferrer" aria-label="NSERC / CRSNG" className="shrink-0">
            <Image src="/logos/nserc.svg" alt="Natural Sciences and Engineering Research Council of Canada" width={200} height={56} className="h-12 w-auto" />
          </a>
        </div>
      </div>
    </div>
  );
}
