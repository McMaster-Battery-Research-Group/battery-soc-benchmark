/**
 * Seeds an admin, a handful of researchers, ~15 evaluated submissions
 * (values calibrated to the existing staging leaderboard), and one open contest.
 *   npm run seed
 */
import "dotenv/config";
import { PrismaClient, type ModelType } from "@prisma/client";
import bcrypt from "bcryptjs";
import { MockEvaluator } from "../src/evaluator/mock-evaluator";

const db = new PrismaClient();

const USERS = [
  { email: process.env.SEED_ADMIN_EMAIL ?? "admin@batterysocbenchmark.ca", name: "Benchmark Admin", affiliation: "McMaster University", role: "ADMIN" as const, password: process.env.SEED_ADMIN_PASSWORD ?? "Admin123!" },
  { email: "p.kollmeyer@example.edu", name: "Phillip Kollmeyer", affiliation: "McMaster University", role: "USER" as const, password: "Password1" },
  { email: "a.rahman@example.edu", name: "Ahnaf Rahman", affiliation: "McMaster University", role: "USER" as const, password: "Password1" },
  { email: "a.mclean@example.edu", name: "Aidan McLean", affiliation: "McMaster University", role: "USER" as const, password: "Password1" },
  { email: "j.chen@example.edu", name: "Jia Chen", affiliation: "University of Waterloo", role: "USER" as const, password: "Password1" },
  { email: "m.okafor@example.edu", name: "Maya Okafor", affiliation: "TU Munich", role: "USER" as const, password: "Password1" },
  { email: "s.park@example.com", name: "Seo-yeon Park", affiliation: "LG Energy Solution", role: "USER" as const, password: "Password1" },
];

const SUBMISSIONS: { user: string; name: string; type: ModelType; desc: string; daysAgo: number; isPrivate?: boolean; contest?: boolean }[] = [
  { user: "a.mclean@example.edu", name: "Aidan's Test CC", type: "COULOMB_COUNTER", desc: "Baseline coulomb counter using nominal capacity, no correction. Reference for the worst case.", daysAgo: 42 },
  { user: "a.mclean@example.edu", name: "Aidan's Test CC 2", type: "COULOMB_COUNTER", desc: "Coulomb counter with temperature-dependent capacity lookup from C/3 discharge tests and OCV reset at rest.", daysAgo: 40 },
  { user: "p.kollmeyer@example.edu", name: "Reference CC", type: "COULOMB_COUNTER", desc: "Lab reference coulomb counter with capacity interpolation, used to sanity-check the evaluation pipeline.", daysAgo: 38 },
  { user: "a.rahman@example.edu", name: "EKF (2RC)", type: "EKF", desc: "Extended Kalman filter on a second-order RC equivalent-circuit model, parameters from HPPC at six temperatures.", daysAgo: 31 },
  { user: "a.rahman@example.edu", name: "FNN", type: "FNN", desc: "Feedforward network, 2×64 hidden units, inputs V, I, T with 60-second moving averages of V and I.", daysAgo: 30 },
  { user: "a.rahman@example.edu", name: "RNN", type: "LSTM", desc: "LSTM-RNN with 571 learnable parameters trained on reordered cycles 1–8 for m80, m448-N and m1000 (reproduces the ITEC 2022 example).", daysAgo: 29 },
  { user: "j.chen@example.edu", name: "UKF-ECM", type: "UKF", desc: "Unscented Kalman filter with a temperature-scheduled 1RC model and online resistance adaptation.", daysAgo: 21 },
  { user: "j.chen@example.edu", name: "GRU-64", type: "GRU", desc: "Single-layer GRU (64 units) with sequence length 500 and Huber loss; trained with additive sensor-noise augmentation.", daysAgo: 18 },
  { user: "m.okafor@example.edu", name: "SPMe-EKF", type: "PHYSICS", desc: "Single-particle model with electrolyte dynamics, identified from C/20 and HPPC data, wrapped in an EKF.", daysAgo: 14 },
  { user: "m.okafor@example.edu", name: "TransSOC-S", type: "TRANSFORMER", desc: "Small encoder-only transformer (4 heads, 2 layers) over 300-step windows with learned temperature embedding.", daysAgo: 12 },
  { user: "s.park@example.com", name: "Hybrid LSTM+CC", type: "HYBRID", desc: "LSTM correction term added to a coulomb-counting backbone; the network only predicts drift.", daysAgo: 9 },
  { user: "s.park@example.com", name: "Hybrid LSTM+CC (private)", type: "HYBRID", desc: "Internal variant with a wider network. Kept private while under review.", daysAgo: 6, isPrivate: true },
  { user: "a.rahman@example.edu", name: "RNN v2 – contest", type: "LSTM", desc: "Contest entry: LSTM with low-pass filtered inputs and initial-SOC warm-start from OCV.", daysAgo: 4, contest: true },
  { user: "j.chen@example.edu", name: "GRU-64 – contest", type: "GRU", desc: "Contest entry: GRU-64 fine-tuned with −20 °C oversampling.", daysAgo: 3, contest: true },
  { user: "m.okafor@example.edu", name: "TransSOC-S – contest", type: "TRANSFORMER", desc: "Contest entry: TransSOC-S with robustness augmentation (gain/offset/noise).", daysAgo: 2, contest: true },
];

async function main() {
  console.log("Seeding…");
  await db.contactMessage.deleteMany();
  await db.submission.deleteMany();
  await db.contestEntry.deleteMany();
  await db.contest.deleteMany();
  await db.userToken.deleteMany();
  await db.user.deleteMany();

  const users = new Map<string, { id: string }>();
  for (const u of USERS) {
    const created = await db.user.create({
      data: { email: u.email, name: u.name, affiliation: u.affiliation, role: u.role, emailVerified: new Date(), passwordHash: await bcrypt.hash(u.password, 11) },
    });
    users.set(u.email, created);
  }

  const now = Date.now();
  const contest = await db.contest.create({
    data: {
      slug: "soc-challenge-2026",
      title: "2026 Battery SOC Estimation Challenge",
      summary: "Build the most accurate and robust state-of-charge estimator for the Tesla 2170 cell across −20 °C to 40 °C. Cash prizes for the top three weighted-error scores.",
      prizeText: "CA$5,000 first prize · CA$2,000 second · CA$1,000 third",
      startsAt: new Date(now - 14 * 86400e3),
      endsAt: new Date(now + 45 * 86400e3),
      status: "OPEN",
      maxSubmissionsPerUser: 5,
      description: `## About the challenge

The McMaster Automotive Resource Centre invites researchers, students and industry teams to benchmark their battery state-of-charge (SOC) estimation algorithms on a blinded, standardized dataset collected from Tesla Model 3 2170 cells.

Entries are evaluated on the same 12 blinded test cases as the public leaderboard, but the **contest leaderboard is frozen at the deadline** and ranked by *weighted error*, which up-weights the hardest conditions: −20 °C, 1000 kg payload, unknown initial SOC and sensor faults.

## Timeline

| Milestone | Date |
| --- | --- |
| Registration opens | Contest start |
| Submission deadline | Contest end (23:59 Eastern) |
| Winners announced | Within 3 weeks of the deadline |

## Prizes

- **First:** CA$5,000
- **Second:** CA$2,000
- **Third:** CA$1,000

Winning teams will be invited to present their approach at a McMaster battery research seminar.`,
      rules: `## Eligibility

1. Open to individuals and teams worldwide. One registration per team; the registered account submits on the team's behalf.
2. Employees of the organising lab may submit but are not eligible for prizes.

## Submissions

3. Up to **5 evaluated submissions** per team. Your best weighted error counts.
4. Models must be submitted in the standard format (MATLAB \`.mat\` function package or Python \`.py\` module) and run inside the evaluator time budget.
5. Models may only be trained on the **open** portion of the dataset and other public data. Any attempt to reconstruct or infer the blinded cells or cycles is disqualifying.
6. Contest submissions are public on the contest leaderboard (model name, author, affiliation, scores). Model files are deleted after evaluation and never shared.

## Judging

7. Ranking is by weighted error at the deadline. Ties are broken by all-cells RMSE, then by earlier submission time.
8. Winners must provide a short (2-page) technical description to receive a prize.
9. The organisers' decisions are final.`,
    },
  });

  for (const email of ["a.rahman@example.edu", "j.chen@example.edu", "m.okafor@example.edu", "s.park@example.com"]) {
    await db.contestEntry.create({ data: { contestId: contest.id, userId: users.get(email)!.id, acceptedTerms: new Date(now - 10 * 86400e3) } });
  }

  const evaluator = new MockEvaluator(0);
  for (const s of SUBMISSIONS) {
    const submittedAt = new Date(now - s.daysAgo * 86400e3 - Math.floor(Math.random() * 6e6));
    const sub = await db.submission.create({
      data: {
        userId: users.get(s.user)!.id,
        modelName: s.name,
        description: s.desc,
        modelType: s.type,
        isPrivate: !!s.isPrivate,
        fileKey: "seed-deleted",
        fileName: `${s.name.replace(/[^a-z0-9]+/gi, "_")}.zip`,
        fileType: "ZIP",
        fileSize: 120_000 + Math.floor(Math.random() * 2_000_000),
        status: "COMPLETED",
        submittedAt,
        completedAt: new Date(submittedAt.getTime() + 25 * 60e3),
        contestId: s.contest ? contest.id : null,
        job: { create: { attempts: 1, log: `${submittedAt.toISOString()} seeded evaluation\n` } },
      },
    });
    const out = await evaluator.evaluate({ submissionId: sub.id, filePath: "seed", fileType: sub.fileType, modelType: sub.modelType, evaluationLevel: "DYNAMIC", log: () => {} });
    const { perCycle, timeSeries, evaluatorVersion, ...scalars } = out;
    await db.evaluationResult.create({ data: { submissionId: sub.id, ...scalars, perCycle: perCycle as object, timeSeries: timeSeries as object, evaluatorVersion } });
    console.log(`  ${s.name.padEnd(28)} ${s.type.padEnd(16)} weighted ${out.weightedError.toFixed(2)} %`);
  }

  // One queued + one failed for the "My submissions" view
  const failedUser = users.get("a.rahman@example.edu")!;
  await db.submission.create({
    data: {
      userId: failedUser.id, modelName: "EKF v2 (broken)", description: "EKF with a bug in the measurement update; kept as an example of a failed evaluation.", modelType: "EKF",
      fileKey: "seed-deleted", fileName: "EKF_v2.zip", fileType: "ZIP", fileSize: 88_000, status: "FAILED",
      failureMessage: "Model function returned NaN SOC at t = 412 s (m80 UDDS −20 °C). Ensure the estimator is numerically stable at high resistance.",
      submittedAt: new Date(now - 5 * 86400e3), completedAt: new Date(now - 5 * 86400e3 + 4e5),
      job: { create: { attempts: 2, log: "seeded failure\nFAILED: NaN in SOC output\n" } },
    },
  });
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
