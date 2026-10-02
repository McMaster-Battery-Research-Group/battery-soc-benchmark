/**
 * Contest rules shared by the admin editor, the public pages and the submit flow: the phase a
 * contest is in (from its dates, not a hand-set status), Toronto-time date entry, prize rows,
 * eligibility wording and the frozen-standings ranking used to pick winners.
 */
import { SITE_TZ } from "@/lib/utils";

export type ContestPhase = "draft" | "upcoming" | "open" | "judging" | "judged";

type Dated = { status: string; startsAt: Date; endsAt: Date; registrationEndsAt?: Date | null };

/** DRAFT is hidden and JUDGED is final; anything else that is published follows its dates. */
export function contestPhase(c: Dated, now = new Date()): ContestPhase {
  if (c.status === "DRAFT") return "draft";
  if (c.status === "JUDGED") return "judged";
  if (now < c.startsAt) return "upcoming";
  if (now <= c.endsAt) return "open";
  return "judging";
}

export const PHASE_BADGE: Record<ContestPhase, string> = { draft: "DRAFT", upcoming: "UPCOMING", open: "OPEN", judging: "JUDGING", judged: "JUDGED" };

/** Registration runs from publication until the registration deadline (or the contest end). */
export function registrationOpen(c: Dated, now = new Date()) {
  const phase = contestPhase(c, now);
  return (phase === "upcoming" || phase === "open") && now <= (c.registrationEndsAt ?? c.endsAt);
}

/** Prisma filter for "published": every status except DRAFT. */
export const PUBLISHED = { status: { in: ["OPEN", "CLOSED", "JUDGED"] as ("OPEN" | "CLOSED" | "JUDGED")[] } };

// ---- dates: admins type wall-clock time in the site's time zone ----

/** "YYYY-MM-DDTHH:mm" for an <input type="datetime-local">, in the site time zone. */
export function zonedInputValue(d: Date, tz = SITE_TZ) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Inverse of zonedInputValue: wall-clock time in the site time zone to an instant (DST-aware). */
export function parseZonedInput(s: string, tz = SITE_TZ): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let t = wall;
  // shift by the zone's offset; twice so a guess on the wrong side of a DST change settles
  for (let i = 0; i < 2; i++) t += wall - Date.parse(`${zonedInputValue(new Date(t), tz)}:00Z`);
  return new Date(t);
}

// ---- prizes ----

export type Prize = { label: string; amount: string };

export function prizesOf(c: { prizes?: unknown; prizeText?: string }): Prize[] {
  if (Array.isArray(c.prizes)) return c.prizes.filter((p): p is Prize => !!p && typeof p.label === "string" && typeof p.amount === "string");
  // contests from before prize rows: show the old free text as a single row
  return c.prizeText ? [{ label: "Prizes", amount: c.prizeText }] : [];
}

export const prizeTextOf = (prizes: Prize[]) => prizes.map((p) => `${p.label}: ${p.amount}`).join(" · ");

// ---- entry rules ----

export const ELIGIBILITY: Record<string, { label: string; statement: string | null }> = {
  ANYONE: { label: "Anyone with an account", statement: null },
  STUDENTS: { label: "Students only", statement: "I am currently enrolled as a student at a university or college, and so is every member of my team." },
  ACADEMIC: { label: "Academic researchers only", statement: "I am affiliated with a university, college or public research institute, and so is every member of my team." },
};

export const RUNTIME_LABEL: Record<string, string> = { matlab: "MATLAB (Model.m / Model.p)", python: "Python (Model.py)" };

export function runtimeAllowed(allowed: string[], runtime: string | null) {
  return !allowed.length || (!!runtime && allowed.includes(runtime));
}

// ---- results ----

export type Winner = { place: number; label: string; amount: string; submissionId: string; userId: string | null; modelName: string; author: string; weightedError: number };

export function winnersOf(c: { winners?: unknown }): Winner[] {
  return Array.isArray(c.winners) ? (c.winners as Winner[]) : [];
}

type Rankable = { id: string; userId: string | null; submittedAt: string; weightedError: number; allCells: number; isLegacy: boolean; isHidden: boolean };

/**
 * Frozen standings: entries submitted by the deadline, ranked by weighted error, then all-cells RMSE,
 * then earlier submission (the tie-break stated on the contest page). Hidden (moderated) and legacy
 * entries never rank. `bestPerEntrant` keeps each
 * account's best entry, which is what prizes are awarded on.
 */
export function standings<T extends Rankable>(rows: T[], endsAt: Date, bestPerEntrant = false): T[] {
  const ranked = rows
    .filter((r) => !r.isLegacy && !r.isHidden && new Date(r.submittedAt) <= endsAt)
    .sort((a, b) => a.weightedError - b.weightedError || a.allCells - b.allCells || Date.parse(a.submittedAt) - Date.parse(b.submittedAt));
  if (!bestPerEntrant) return ranked;
  const seen = new Set<string>();
  return ranked.filter((r) => {
    const k = r.userId ?? r.id;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Starter text for the Rules field, filled from the form's own settings. */
export function starterRules(o: { maxSubmissionsPerUser: number; maxTeamSize: number; eligibility: string; allowedRuntimes: string[] }) {
  const who = { ANYONE: "Anyone with a verified account may enter.", STUDENTS: "Entrants must be students currently enrolled at a university or college.", ACADEMIC: "Entrants must be affiliated with a university, college or public research institute." }[o.eligibility] ?? "";
  const runtimes = o.allowedRuntimes.length ? `Entries must be ${o.allowedRuntimes.map((r) => RUNTIME_LABEL[r] ?? r).join(" or ")} packages.` : "Entries may be MATLAB or Python packages.";
  return `## Eligibility

${who} ${o.maxTeamSize > 1 ? `Teams of up to ${o.maxTeamSize} people may enter; one account registers and submits for the team, and each person may be on only one team.` : "Entries are individual."}

## Entries

- Register before submitting. Each entrant may make up to ${o.maxSubmissionsPerUser} contest submissions; failed evaluations do not count.
- ${runtimes}
- Packages follow the standard [submission format](/docs#submission-format) and are evaluated on the same blinded data as the public leaderboard.
- Contest entries are public on the contest leaderboard.

## Ranking

Entries are ranked by weighted error. Ties are broken on all-cells RMSE, then on the earlier submission. Only submissions made before the deadline count, and each entrant's best entry is used for prizes.

## Prizes

Prizes go to the top entrants in order. The organizers may withhold a prize if an entry breaks these rules.
`;
}
