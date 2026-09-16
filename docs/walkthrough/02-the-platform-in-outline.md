<a id="part-2"></a>
## 2. The platform in outline

> **In this chapter.** The five stages from open data to leaderboard, the three programs that implement them, the architectural rule that protects the withheld data, and where each component is hosted.

### 2.1 Five stages

![Figure 2.1. The public face of the platform: the landing page, with the top of the leaderboard.](figures/landing.png)

The platform reduces to five stages, and its credibility rests on the separation between the first and the fourth:

```mermaid
flowchart TB
    A[("1 · Open dataset, published")] --> B(["2 · Researcher develops an SOC estimator"])
    B --> C(["3 · Uploads a .zip: a Python or MATLAB model file<br/>plus its parameters"])
    C --> D>"4 · Evaluated on withheld data"]
    D --> E["5 · Public leaderboard and PDF report"]
    classDef data fill:#E3F0F5,stroke:#0D5D78,color:#1d2428
    classDef person fill:#EFE6F5,stroke:#6B3FA0,color:#1d2428
    classDef danger fill:#FFE5DF,stroke:#B3261E,color:#1d2428
    classDef web fill:#F2E6EC,stroke:#7A003C,color:#1d2428
    class A data
    class B,C person
    class D danger
    class E web
```

Figure 2.2. The five stages. Stage 1 is public and stage 4 is confidential; the benchmark's validity depends on keeping them apart.

### 2.2 Three programs and one rule

Behind the website are three separate programs, and the architecture follows from one rule:

> **The web tier never executes submitted code and never has access to the withheld data.**

The three programs divide the work as follows:

- **The website** serves pages and forms, records submissions, and shows results. It reads and writes the database and nothing else.
- **The worker** is a separate machine under the laboratory's control. It holds the withheld data, claims queued submissions and runs each evaluation.
- **The sandbox** is an isolated container the worker starts for every evaluation: no network access, a read-only filesystem, discarded when the run ends. It is the only place a submitted model is ever executed.

![Figure 2.3. The three programs. The website and the worker share nothing but the database; the sandbox is the only place a submitted model is ever executed.](figures/fig-tiers.png)

The website and the worker never communicate directly; all coordination passes through the database. Three consequences of this recur throughout the manual:

1. An additional worker can be added with no configuration, since it simply begins claiming jobs.
2. The website remains fully available when no worker is reachable, as it did during a ten-hour network outage in September 2026.
3. The job queue is an ordinary database table rather than a separate message-queue service.

### An analogy: the sealed examination

The arrangement is easier to remember as the way a university runs a written examination. Figure 2.4 draws the comparison.

![Figure 2.4. The platform as a sealed examination. The registrar's office (website) accepts scripts and posts marks; the filing room (database) is the only place both sides touch; the locked marking room (worker) holds the only copy of the answer key (withheld data); each script is marked in a sealed booth (sandbox) and shredded afterwards.](figures/fig-exam.png)

- **The registrar's office is the website.** Candidates enrol, hand in a sealed script, and later read their mark on the noticeboard. The clerks never open a script and have never seen the answer key.
- **The filing room is the database.** The registrar drops each script in the IN tray; the examiner collects it from there and returns the mark to the DONE tray. The two never meet, so a second examiner can start work simply by collecting from the same tray.
- **The locked marking room is the worker.** It holds the only copy of the answer key. Nobody but the examiner enters, and the examiner never leaves with it.
- **The sealed exam booth is the sandbox.** The script is answered against the key one at a time, in a booth with no phone and no window, and is shredded the moment it has been marked. Nothing that happens in the booth can reach the outside, and nothing is kept.

A submitted model is the candidate. It is given the questions (the withheld drive cycles), writes its answers (the estimates), and is marked against the key (the reference state of charge). It never sees the key, and no copy of it survives the examination.

### 2.3 Where the components are hosted

Each program runs on a different service, chosen so that the platform costs nothing to host and so that the withheld data stays on a machine the laboratory controls. Figure 2.5 shows the four.

![Figure 2.5. Where each component runs. The website on Vercel, the database and file storage on Supabase, the worker on the Alliance's Arbutus cloud, and the source code on GitHub.](figures/fig-hosting.png)

### 2.4 Visual conventions

Every diagram in this manual uses one icon, one colour and one shape for each kind of thing, so a component looks the same on every page. The pictures use the icons; the flow diagrams, which are drawn with a diagramming tool that cannot show icons, use the shapes and colours. Figure 2.6 is the key to both.

![Figure 2.6. The visual vocabulary of the manual: the icon used in pictures, the shape and colour used in flow diagrams, and what each stands for.](figures/fig-legend.png)

**Files to open:** [README.md](../../README.md) → [prisma/schema.prisma](../../prisma/schema.prisma) → [src/evaluator/worker.ts](../../src/evaluator/worker.ts).

