<a id="part-3"></a>
## 3. Using the platform

> **In this chapter.** The workflow of a researcher, page by page: registering an account, validating a package before submission, submitting, interpreting the results, and locating the model on the leaderboard.

### 3.1 Registration

Registration requires a name, an institutional affiliation, an e-mail address and a password. A confirmation e-mail follows. Opening its link displays a page with a **Confirm** button, and pressing that button is what verifies the account; Section 7.1 explains why the link alone is not sufficient. A verified user may then sign in, and the session remains valid for fourteen days.

![Figure 3.1. The registration page. The name and affiliation entered here are displayed beside the user's models on the leaderboard.](figures/register.png)

### 3.2 Validating a package before submission

Each account is limited to three submissions per day, so it is worth validating a package before spending one. The top of the submission page contains a **Test your package first** panel. Selecting a zip and pressing **Run test** executes the package through the real evaluator on one *public* drive cycle (cell m80, profile REORDERED1, 25 °C, two hours). The model's console output streams onto the page, and the error on that cycle is reported when it completes. A test run is not recorded anywhere public and does not involve the withheld data. Its purpose is to catch the defects that would otherwise waste a submission:

- a model file that is missing or incorrectly named,
- a parameter file the model attempts to load but the package does not contain,
- a model function that returns a value of the wrong shape or outside the interval 0 to 1.

![Figure 3.2. The submission page. The test panel is placed above the submission form; the checklist on the right specifies the package contents.](figures/submit.png)

![Figure 3.3. A completed test run. The panel reports RMSE, mean absolute error and maximum error on the public cycle, the model's console output, and the estimate plotted against the measured state of charge.](figures/dryrun-result.png)

The package format is deliberately minimal:

- All files are placed at the top level of the archive, with no sub-directories.
- Exactly one file is the model: `Model.py` for Python, or `Model.m` or `Model.p` for MATLAB.
- Any parameter files the model loads (`.mat`, `.npz` and similar) are placed alongside it.

Section 5.1 specifies the model function's interface.

### 3.3 Submission

Below the test panel is the submission form. It collects:

- a model name and a short description,
- the model type (Coulomb counter, extended or unscented Kalman filter, feed-forward, LSTM or GRU network, transformer, physics-based, hybrid, or other),
- whether the model is to be private,
- an optional contest to enter,
- any co-authors.

The form is validated in the browser with the same rules the server applies, so an error is reported before the upload begins. Once a package has been submitted, the page shows its position in the queue, an estimated start time and whether a worker capable of running the package's language is currently online. When evaluation begins, the page switches to a live progress indicator and the model's console output.

### 3.4 Interpreting results

The results page is organised to present interpretation before detail. It opens with a plain-language reading of the scorecard, generated from the numbers themselves:

- which test case contributes most to the weighted score,
- whether accuracy on the withheld cell matches accuracy on the open cells, which indicates generalisation rather than memorisation,
- how accuracy varies with temperature,
- whether the model recovers from an incorrect initial state of charge,
- whether the model tolerates a biased current measurement.

Each statement can be verified against the scorecard immediately below it.

![Figure 3.4. The head of a results page. The interpretation is generated from the scorecard beneath it.](figures/results-top.png)

The scorecard lists the eighteen test cases with the RMSE, the weight and the product of the two. The products sum to the weighted error shown at the foot of the table, so the derivation of the score is fully visible. Below the scorecard are the key traces: the cycles that most differentiate estimators (the temperature extremes, the withheld cell and the robustness runs), each plotted against the measured state of charge with interactive zoom. The remaining material is available in collapsed sections:

- the per-cycle table covering all 144 cycles,
- the score history, recording every revision of the result,
- the downloads: the PDF report, the results as JSON, and the full-resolution traces.

![Figure 3.5. The foot of the scorecard and the first key trace. The weighted error is the sum of the weight × RMSE column.](figures/results-keycases.png)

### 3.5 The leaderboard

The leaderboard ranks every public, completed model by weighted error in ascending order. Ties are broken by the all-cells error and then by submission time. The table can be filtered by author, affiliation and model type; additional columns, including the per-temperature and robustness cases, can be revealed with the **Columns** control; and the table can be exported as CSV. Selecting a model opens its results page, and the **Compare** page overlays two to four models on the same charts.

![Figure 3.6. The leaderboard, with its explanatory panel expanded.](figures/leaderboard.png)

A signed-in user's private models are shown to that user with a dashed provisional rank, indicating the position the model would occupy, without displacing any public entry. Results produced by an earlier version of the scoring code remain listed but unranked, and their authors are invited to resubmit. Because packages are deleted after evaluation, a re-evaluation cannot be performed automatically.

### 3.6 Co-authors and contests

A co-author is invited by e-mail and must accept by pressing a button on the invitation page; only then is the co-author listed publicly and included in result notifications. A **contest** is a time-bounded event with its own leaderboard, frozen at the closing date. Contest entries must remain public, and their name and model type are fixed once the contest closes.

![Figure 3.7. A contest page: rules, timeline and the contest leaderboard.](figures/contest.png)

**Files to open:** [submit-form.tsx](../../src/app/(app)/submit/submit-form.tsx) → [dry-run-panel.tsx](../../src/app/(app)/submit/dry-run-panel.tsx) → [submissions/[id]/page.tsx](../../src/app/(app)/submissions/[id]/page.tsx) → [leaderboard-table.tsx](../../src/components/leaderboard/leaderboard-table.tsx).

