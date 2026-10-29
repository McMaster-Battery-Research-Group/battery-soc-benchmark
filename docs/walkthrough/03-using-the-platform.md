<a id="part-3"></a>
## 3. Using the platform

> **In this chapter.** The workflow of a researcher, page by page: registering an account, validating a package before submission, the three-step submission form, interpreting the results page tab by tab, the leaderboard and the comparison page, and the pages that document the benchmark itself.

### 3.1 Registration

Registration is a four-step process:

1. The form asks for a name, an institutional affiliation, an e-mail address and a password.
2. A confirmation e-mail follows. Opening its link displays a page with a **Confirm** button.
3. Pressing that button verifies the account. Section 7.1 explains why the link alone is not sufficient.
4. The verified user signs in, and the session remains valid for fourteen days.

![Figure 3.1. The registration page. The name and affiliation entered here are displayed beside the user's models on the leaderboard.](figures/register.png)

A signed-in user also has a public **researcher profile** (occupation, biography, website, and ORCID, Google Scholar, ResearchGate, GitHub and LinkedIn identifiers, each shown with its brand icon) and a profile picture, resized in the browser to a small JPEG before it is uploaded. The profile page lists the person's public models.

### 3.2 Validating a package before submission

Each account is limited to three submissions per day, so it is worth validating a package before spending one. The submission form's first step holds the **test run** control: once a zip has been chosen, pressing **Run test** executes the package through the real evaluator on one *public* drive cycle (cell m80, profile REORDERED1, 25 °C, two hours). The model's console output streams onto the page, and the error on that cycle is reported when it completes. A test run is not recorded anywhere public and does not involve the withheld data. Its purpose is to catch the defects that would otherwise waste a submission:

- a model file that is missing or incorrectly named,
- a parameter file the model attempts to load but the package does not contain,
- a model function that returns a value of the wrong shape or outside the interval 0 to 1,
- a model written for a different calling convention, which returns a constant and is rejected within seconds.

![Figure 3.2. A completed test run. The panel reports RMSE, mean absolute error and maximum error on the public cycle, the model's console output, and the estimate plotted against the measured state of charge.](figures/dryrun-result.png)

The package format is deliberately minimal:

- All files are placed at the top level of the archive, with no sub-directories.
- Exactly one file is the model: `Model.py` for Python, or `Model.m` or `Model.p` for MATLAB.
- Any parameter files the model loads (`.mat`, `.npz` and similar) are placed alongside it.

Section 5.1 specifies the model function's interface. Four reference packages (a Coulomb counter, an extended Kalman filter, a feed-forward network and an LSTM, each in both languages) can be downloaded from the **Examples** page or run as a test with one click.

### 3.3 Submission

The submission page is organised as three numbered steps, with the package checklist and a description of what happens next in the margin.

![Figure 3.3. The submission page. Step 1 takes the package; the margin specifies the package contents and what follows.](figures/submit.png)

**Step 1, the package.** One `.zip` of at most 50 MB, dropped onto the page or chosen from disk, with the test run described above available immediately.

**Step 2, about the model.** This is what the leaderboard and the results page show, and it is the part of the form that the laboratory asked to be made substantive (issue tracker, October 2026), because a leaderboard of entries named "LSTM" with one-line descriptions does not tell a reader what was done:

- a **model name** of up to 50 characters, named after the method and never after a person;
- the **model type** (Coulomb counter, extended or unscented Kalman filter, feed-forward, LSTM or GRU network, transformer, physics-based, hybrid, or other);
- a **description** of 80 to 2000 characters. The field asks for the inputs, the model structure (equations, network layers, filter states), what the model was trained or fitted on, and what sets it apart from a textbook version. A description or model name that contains the name of the submitter, of the person it is submitted for, or of any co-author is refused with a message that quotes the match: the authors are listed beside the model already, and the description is for the model;
- an optional **Paper** link (DOI, arXiv or publisher) and an optional **Code** link (a public repository);
- an optional **model diagram** (PNG, JPEG or WebP, up to 3 MB) and an optional **write-up** (PDF, up to 10 MB).

![Figure 3.4. Step 2 of the form: name, type, the structured description, the paper and code links, and the two attachments.](figures/submit-about.png)

**Step 3, options.** Most submitters leave these as they are:

- **Share the model files.** Off by default, in which case the package is deleted the moment the evaluation finishes. On, the package is kept and anyone who can see the submission gets a *Model files* download button on its page, plus a *files* badge on the leaderboard. An owner can stop sharing later, which deletes the package; a package that was not shared cannot be shared afterwards, because it no longer exists.
- **Private.** The model is evaluated and shown to its authors with a provisional rank, but does not appear on the public leaderboard.
- **Contest.** Enter the model into the contest that is currently open, if any (Section 3.6).
- **Submit on someone's behalf.** The uploader can name the actual author, either an existing account or a person without one (name, affiliation and an optional photo), and can choose whether to be listed too. Permissions, e-mail and later versions stay with the uploader; the credit goes to the named author.
- **Co-authors.** Account holders chosen from a picker. Each receives an invitation and is listed publicly only after accepting it.

The form is validated in the browser with the same rules the server applies, so an error is reported before the upload begins. Once a package has been submitted, the page shows its position in the queue, an estimated start time and whether a worker capable of running the package's language is currently online. When evaluation begins, the page switches to a live progress indicator with the stage and the remaining time.

### 3.4 Interpreting results

The results page opens with three cards and continues as a set of tabs, so that the headline figures are read first and the detail is reached deliberately.

![Figure 3.5. The head of a results page: the three summary cards and the Scorecard tab.](figures/results-top.png)

**The three cards.** The score (weighted error) with the model's rank and the leaderboard median; the RMSE over all 144 withheld cycles; and the RMSE on the withheld m448 cell alone. The last two carry the crossed-eye badge that marks withheld data throughout the site, and each states whether the figure is better or worse than the leaderboard median, so a reader knows at once whether the model generalises to the cell it has never seen.

**Scorecard.** The eighteen test cases with the RMSE, a bar scaled to the model's worst test, the weight and the product of the two. The products sum to the weighted error at the head of the table, so the derivation of the score is fully visible.

**Key cases.** The cycles that most differentiate estimators (the temperature extremes, the withheld cell, the worst cycle and the robustness runs), each plotted against the measured state of charge with interactive zoom and pan.

**Charts.** The scorecard as charts, followed by every figure the laboratory's original MATLAB evaluation script produced, in the script's order:

- *Error by test case*, with each bar labelled by what the case is (payload, cycle type, temperature, robustness) rather than by a test number;
- *Where the weighted error comes from*, a donut of each test group's weight × RMSE as a share of the score, which shows where an improvement would move the rank most;
- the figure gallery: withheld versus open cell (tests 1 to 3), driving versus charging (test 4), the three payloads on UDDS (tests 5 and 6), standard versus non-standard highway cycles (tests 7 and 8), RMSE against temperature with UDDS at −20, 0 and 40 °C (test 9), the 90, 60 and 30 % starts overlaid per cycle and aligned on their common end (test 10), and the ±0.3 A offsets overlaid per cycle with RMSE against every offset swept (test 11). Each panel has SOC above, error below and the RMSE in its legend, and every panel carries icon chips naming the payload, HVAC state, cycle type, chamber temperature and robustness test, so that the plots can be told apart at a glance. Every figure can be downloaded as a PNG.

![Figure 3.6. The Charts tab: the error-by-test-case bars with descriptive labels, and the donut of where the score comes from.](figures/results-charts.png)

![Figure 3.7. The figure gallery. Left, an open cell with its SOC trace; right, the withheld m448 cell, whose panel shows the error only and explains why. The chips under each title name payload, HVAC state, cycle type and temperature.](figures/results-gallery.png)

![Figure 3.8. Test 10 in the gallery: the three incorrect starts overlaid on one cycle and aligned on their common end, with one RMSE per start. A voltage-informed estimator converges; a Coulomb counter never would.](figures/results-robustness.png)

**All 144 cycles.** The per-cycle table with RMSE, mean absolute error, maximum error and duration, sortable and filterable.

**History.** Every revision of the result (evaluation, re-evaluation, re-score, failure, cancellation), shown to the submission's authors and to administrators. Administrators also see, per attempt, the full evaluator console as it was at the time, so that a failure can be diagnosed long after the job's live log has been replaced by a resubmission.

**About.** The description, the diagram and write-up if any, the Paper and Code buttons, the package row (name, unpacked and zipped size, whether the files are shared, and a download button when they are), the evaluator version, and the downloads: the PDF report, the results as JSON and, for the authors, the full-resolution traces.

![Figure 3.9. The About tab of a recent entry: a structured description that says what the model is, how it was trained and what it does not use.](figures/results-about.png)

The **PDF report**, regenerated on request, contains the summary with every test case as bars and the donut, the scorecard with its arithmetic, the key plots, a grid of all 144 cycles shaded by error, the score history, and an appendix of per-cycle errors. It is also attached to the results e-mail.

### 3.5 The leaderboard

The leaderboard ranks every public, completed model by weighted error in ascending order; the first three carry gold, silver and bronze medals. Ties are broken by the all-cells error and then by submission time. The table offers:

- filters by author, affiliation and model type;
- the default columns Model, Author, Submitted, Weighted error, Complexity, All cells, Blinded cell, Max error, **Model size** (the uncompressed total of every file inside the package, recorded at submission; entries uploaded before this was recorded show the zipped size, marked as such) and **Peak RAM** (the peak memory of the model process during evaluation, measured in the sandbox, which includes the MATLAB or Python runtime);
- further columns through the **Columns** control: the per-temperature and robustness cases, the description, and more;
- a *files* badge on any row whose package is shared;
- one horizontal scrollbar, placed above the column headers so that the sideways scroll is visible without scrolling to the foot of the page; the Model column stays pinned while scrolling;
- a **How to read this table** panel, export as **CSV**, and a link from each model to its results page.

![Figure 3.10. The leaderboard: medals for the top three, the author with their profile picture, and the default measurement columns.](figures/leaderboard.png)

A signed-in user's private models are shown to that user with a dashed provisional rank, indicating the position the model would occupy, without displacing any public entry. Results produced by an earlier version of the scoring code remain listed but unranked, and their authors are invited to resubmit. Scores that predate the platform can be recorded by an administrator as **legacy** entries, which carry a badge, have no package and are never mistaken for a run of this evaluator.

**Compare.** The comparison page overlays two to four models: every test case side by side with the best value in each row marked, the error-by-test-case bars, error against temperature, and any withheld cycle as a time-domain overlay. For the *worst case* of a model the page now overlays the same cycle from each of the other models (October 2026); the withheld m448 cell is the one cycle that cannot be overlaid, because its reference trace is never served.

![Figure 3.11. The comparison page with three models: the side-by-side metrics with the best value marked in each row.](figures/compare.png)

### 3.6 Co-authors, named authors and contests

A **co-author** with an account is invited by e-mail and must accept by pressing a button on the invitation page; only then is the co-author listed publicly and included in result notifications. A **named author** without an account (credited by the uploader at submission, or by an administrator afterwards) is listed everywhere the model appears, with an optional photo, but has no profile page and receives no e-mail. Administrators can reassign ownership, add and remove co-authors and decide whether the uploader is shown as lead author, as a co-author or not at all; one helper, `publicAuthors`, is the single source of the author list for the leaderboard, the results page, the PDF, the share image and the researcher profiles.

A **contest** is a time-bounded event with its own leaderboard, frozen at the closing date. A contest passes through phases derived from its dates (upcoming, open, judging, judged), all in Toronto time; it carries prize rows, an eligibility statement that entrants confirm, an entry limit per person, a team size, optionally a restriction to one language, and a registration deadline. Contest entries must remain public, and their name and model type are fixed once the contest closes. When the results are finalised the winners are recorded on the contest page and each is e-mailed.

![Figure 3.12. A contest page: rules, timeline and the contest leaderboard.](figures/contest.png)

### 3.7 The documentation pages

Under **Learn** the site documents itself: *Get started* (the walkthrough from account to result), *Example models* (the eight reference packages), *Dataset* (the four cells, the open-versus-withheld table and the file format, using the same icons as the result plots), *Methodology* (the model interface, the eighteen tests and the weights, with the equations), *Glossary* and *Help & FAQ*. **About** describes the project, the laboratory with a link to battery.mcmaster.ca, and the people behind it.

![Figure 3.13. The Dataset page. The withheld cell carries the crossed-eye badge; payload, HVAC, temperature and cycle-type icons are the same ones used on every result plot.](figures/dataset.png)

**Files to open:** [submit-form.tsx](../../src/app/(app)/submit/submit-form.tsx) → [dry-run-panel.tsx](../../src/app/(app)/submit/dry-run-panel.tsx) → [submissions/[id]/page.tsx](../../src/app/(app)/submissions/[id]/page.tsx) → [figure-gallery.tsx](../../src/components/charts/figure-gallery.tsx) → [leaderboard-table.tsx](../../src/components/leaderboard/leaderboard-table.tsx) → [authors.ts](../../src/lib/authors.ts).

