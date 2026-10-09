import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Download, FlaskConical, UploadCloud, Trophy, Thermometer, Database, ShieldCheck, BarChart3 } from "lucide-react";
import { PipelineDiagram } from "@/components/diagrams";
import { HeroTrace } from "@/components/hero-lines";
import { getSiteStats, getLeaderboardRows, getShowcase } from "@/lib/queries";
import { isCurrentBenchmark } from "@/lib/benchmark-version";
import { fmtPct, fmtDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { RankBadge } from "@/components/leaderboard/rank-badge";
import { CellGlyph } from "@/components/layout/logo";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [stats, rows, showcase] = await Promise.all([getSiteStats(), getLeaderboardRows(), getShowcase()]);
  // same ranking rule as the leaderboard: only current-benchmark rows are ranked (legacy-scored ones are listed there unranked)
  const top = rows.filter((r) => isCurrentBenchmark(r.evaluatorVersion)).sort((a, b) => a.weightedError - b.weightedError).slice(0, 5);

  return (
    <>
      {/* Hero — maroon copy block with the brand circle device, cropped on two sides */}
      <section className="relative overflow-hidden bg-maroon text-white">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-56 hidden size-[640px] rounded-full border-[56px] border-gold/90 opacity-90 md:block" />
        <div className="container-site relative grid gap-10 py-12 md:grid-cols-12 md:py-14">
          <div className="md:col-span-7">
            <p className="font-heading text-xs font-semibold uppercase tracking-[0.16em] text-gold">Open benchmark · Blinded evaluation</p>
            <h1 className="mt-3 font-heading text-[2rem] font-bold leading-[1.12] text-white sm:text-4xl md:mt-4 md:text-[50px] md:leading-[55px]">
              The standardized benchmark for battery state-of-charge estimation.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-white/90 sm:text-lg md:mt-6">
              Train on open Tesla Model 3 2170 cell data. Submit your estimator. Get scored on 144 blinded drive cycles from −20 °C to 40 °C.
            </p>
            <div className="mt-6 grid gap-3 sm:flex sm:flex-wrap md:mt-8">
              <Button asChild variant="gold" size="lg"><Link href="/submit">Submit a model <ArrowRight /></Link></Button>
              <Button asChild size="lg" className="border border-white/40 bg-transparent text-white hover:bg-white hover:text-maroon"><Link href="/leaderboard">View leaderboard</Link></Button>
            </div>
            <p className="mt-5 text-sm text-white/75 md:mt-6">Free for academic and industry use · CC-BY 4.0 dataset · blinded evaluation</p>
            {/* who stands behind it, visible before anyone scrolls */}
            <div className="mt-8 flex flex-wrap items-start gap-x-12 gap-y-5 md:mt-9">
              <a href="https://www.eng.mcmaster.ca/ece/" target="_blank" rel="noreferrer" aria-label="McMaster University, Electrical and Computer Engineering">
                <p className="font-heading text-[10px] font-semibold uppercase tracking-[0.16em] text-white/60">Developed at</p>
                <Image src="/logos/mcmaster-white.svg" alt="" width={556} height={350} className="mt-2 h-14 w-auto md:h-16" />
              </a>
              <a href="https://www.nserc-crsng.gc.ca" target="_blank" rel="noreferrer" aria-label="NSERC / CRSNG">
                <p className="font-heading text-[10px] font-semibold uppercase tracking-[0.16em] text-white/60">Supported by</p>
                <span className="mt-2 flex items-center gap-3">
                  <Image src="/logos/nserc-white.svg" alt="" width={116} height={56} className="h-12 w-auto" />
                  <span className="text-xs leading-snug text-white/75">NSERC Discovery<br />Grant RGPIN-2024-06796</span>
                </span>
              </a>
            </div>
          </div>
          <div className="md:col-span-5">
            <div className="relative rounded-brand border border-white/20 bg-maroon-800/95 p-5 shadow-xl">
              <div className="flex items-center justify-between">
                <p className="font-heading text-sm font-semibold text-white">Top of the leaderboard</p>
                <Link href="/leaderboard" className="text-xs text-gold underline">All models</Link>
              </div>
              <ol className="mt-3 divide-y divide-white/15">
                {top.map((r, i) => (
                  <li key={r.id} className="flex items-center gap-3 py-2.5">
                    <RankBadge rank={i + 1} className={i >= 3 ? "text-white/80" : ""} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/submissions/${r.id}`} className="block truncate font-heading text-sm font-semibold text-white hover:underline">{r.modelName}</Link>
                      <p className="truncate text-xs text-white/70">{r.author}{r.collaborators.length ? " et al." : ""} · {r.affiliation}</p>
                    </div>
                    <span className="font-heading text-sm font-semibold tabular text-gold">{fmtPct(r.weightedError)}%</span>
                  </li>
                ))}
              </ol>
              <p className="mt-2 text-[11px] text-white/60">Weighted error (% SOC), lower is better.</p>
            </div>
            {/* what the numbers above measure: the leader on one cold blinded cycle */}
            <HeroTrace data={showcase} />
          </div>
        </div>
      </section>

      {/* Stats strip */}
      <section className="border-b border-border bg-white">
        <div className="container-site grid grid-cols-2 divide-border py-6 md:grid-cols-4 md:divide-x">
          {[
            { v: stats.submissions, l: "Evaluated models" },
            { v: stats.institutions, l: "Institutions" },
            { v: stats.best ? `${fmtPct(stats.best.allCells)}%` : "—", l: "Best all-cells RMSE" },
            { v: "144 + 51", l: "Blinded drive cycles + robustness runs" },
          ].map((s) => (
            <div key={s.l} className="px-4 py-2 text-center md:text-left">
              <p className="font-heading text-3xl font-bold tabular text-ink">{s.v}</p>
              <p className="text-sm text-grey-700">{s.l}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="container-site py-12">
        <div className="max-w-2xl">
          <p className="font-heading text-xs font-semibold uppercase tracking-[0.14em] text-maroon">How it works</p>
          <h2 className="mt-2 font-heading text-3xl font-bold">From open data to a standardized score</h2>
        </div>
        <PipelineDiagram className="mt-6 hidden md:block" />
        <ol className="mt-6 grid gap-6 md:grid-cols-3">
          {[
            { icon: Download, t: "Download the open data", d: "Characterization tests (HPPC, C/20, C/3, C/2, 1C) and reordered drive cycles for three cells at six temperatures.", href: "/dataset", cta: "Get the dataset" },
            { icon: FlaskConical, t: "Build your estimator", d: "Any method: coulomb counting, Kalman filters, physics-based models, neural networks. Package it as Model.m, Model.p or Model.py, then test it on the site before submitting.", href: "/docs#submission-format", cta: "Submission format" },
            { icon: UploadCloud, t: "Submit for blinded evaluation", d: "Your model runs against cycles and a cell you have never seen, plus robustness cases with initial-SOC and current-sensor errors. Results land on the leaderboard with full time-domain plots.", href: "/submit", cta: "Submit a model" },
          ].map((s, i) => (
            <li key={s.t} className="card flex flex-col p-6">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-brand bg-maroon text-white"><s.icon className="size-5" /></span>
                <span className="font-heading text-sm font-semibold text-grey-600">Step {i + 1}</span>
              </div>
              <h3 className="mt-4 font-heading text-lg font-semibold">{s.t}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-grey-700">{s.d}</p>
              <Link href={s.href} className="mt-4 inline-flex items-center gap-1 font-heading text-sm font-semibold text-maroon hover:underline">{s.cta} <ArrowRight className="size-4" /></Link>
            </li>
          ))}
        </ol>
      </section>

      {/* Contest + dataset */}
      <section className="bg-grey-100/70">
        <div className="container-site grid gap-6 py-12 lg:grid-cols-2">
          {stats.contest ? (
            <div className="card overflow-hidden">
              <div className="flex items-center gap-3 bg-maroon px-6 py-4 text-white">
                <Trophy className="size-5 text-gold" />
                <p className="font-heading text-sm font-semibold uppercase tracking-wide">{stats.contest.startsAt > new Date() ? "Upcoming contest" : "Open contest"}</p>
                <span className="ml-auto text-xs text-white/80">{stats.contest.startsAt > new Date() ? `Opens ${fmtDate(stats.contest.startsAt)}` : `Deadline ${fmtDate(stats.contest.endsAt)}`}</span>
              </div>
              <div className="p-6">
                <h3 className="font-heading text-2xl font-bold">{stats.contest.title}</h3>
                <p className="mt-2 text-grey-800">{stats.contest.summary}</p>
                <p className="mt-3 font-heading font-semibold text-maroon">{stats.contest.prizeText}</p>
                <Button asChild className="mt-5"><Link href={`/contest/${stats.contest.slug}`}>Contest details & registration</Link></Button>
              </div>
            </div>
          ) : (
            <div className="card p-6">
              <div className="flex items-center gap-3">
                <Trophy className="size-6 text-grey-400" />
                <span className="rounded-full bg-grey-100 px-2.5 py-0.5 font-heading text-xs font-semibold uppercase tracking-wide text-grey-600">No contest running</span>
              </div>
              <h3 className="mt-3 font-heading text-2xl font-bold">Contests</h3>
              <p className="mt-2 text-grey-800">Nothing is open at the moment. Contests with cash prizes are announced here when they start.</p>
              <Button asChild variant="secondary" className="mt-5"><Link href="/contest">Past contests</Link></Button>
            </div>
          )}
          <div className="card p-6">
            <Database className="size-6 text-maroon" />
            <h3 className="mt-3 font-heading text-2xl font-bold">The dataset</h3>
            <ul className="mt-3 grid gap-2 text-sm text-grey-800 sm:grid-cols-2">
              <li className="flex items-center gap-2"><CellGlyph className="size-4" /> 4 × Tesla/Panasonic 2170 NCA cells</li>
              <li className="flex items-center gap-2"><Thermometer className="size-4 text-maroon" /> −20, −10, 0, 10, 25, 40 °C</li>
              <li className="flex items-center gap-2"><BarChart3 className="size-4 text-maroon" /> 384 drive cycles, 1 Hz</li>
              <li className="flex items-center gap-2"><ShieldCheck className="size-4 text-maroon" /> Open / blind split by design</li>
            </ul>
            <p className="mt-3 text-sm text-grey-700">Payloads of 80, 448 and 1000 kg with HVAC on/off, modelled on a Tesla Model 3 Standard Range. Licensed CC-BY 4.0 on Borealis.</p>
            <Button asChild variant="secondary" className="mt-5"><Link href="/dataset">Explore the dataset</Link></Button>
          </div>
        </div>
      </section>

      {/* Citation */}
      <section className="container-site py-12">
        <div className="rounded-brand border-l-4 border-gold bg-white p-6 shadow-[var(--shadow-card)]">
          <p className="font-heading text-xs font-semibold uppercase tracking-[0.14em] text-maroon">Cite the benchmark</p>
          <p className="mt-2 text-[15px] leading-relaxed text-grey-800">
            P. J. Kollmeyer, M. Naguib, F. Khanum and A. Emadi, “A Blind Modeling Tool for Standardized Evaluation of Battery State of Charge Estimation Algorithms,” <em>2022 IEEE Transportation Electrification Conference &amp; Expo (ITEC)</em>, pp. 243–248, 2022.{" "}
            <a href="https://doi.org/10.1109/ITEC53557.2022.9813996" className="text-maroon underline" target="_blank" rel="noreferrer">doi:10.1109/ITEC53557.2022.9813996</a>
          </p>
          <p className="mt-2 text-sm text-grey-700">Dataset: P. J. Kollmeyer, F. Khanum, M. Naguib, A. Emadi, “Tesla Model 3 2170 Li-ion Cell Dataset and Battery SOC Estimation Blind Modeling Tool,” Borealis, <a href="https://doi.org/10.5683/SP3/ZVTR4B" className="text-maroon underline" target="_blank" rel="noreferrer">doi:10.5683/SP3/ZVTR4B</a>.</p>
        </div>
      </section>
    </>
  );
}
