<a id="part-3"></a>
## 3. Using the site

> **In this chapter.** What a researcher actually does, page by page: create an account, test a package for free, submit it, read the results, and find it on the leaderboard.

### 3.1 Creating an account

Registration asks for a name, an affiliation, an e-mail address and a password. A confirmation e-mail follows; opening its link shows a page with a **Confirm** button, and pressing that button is what verifies the account (Chapter 7 explains why it is a button rather than the link itself). After that, signing in gives a session that lasts fourteen days.

![Figure 3.1. The registration page. Name and affiliation are what the leaderboard shows next to a model.](figures/register.png)

### 3.2 Testing a package before submitting

Every account gets three submissions a day, so it pays to check a package before spending one. The top of the submit page has a **Test your package first** panel. Choose a zip and press **Run test**: the package is run through the real evaluator on one *public* drive cycle (the m80 cell, REORDERED1, 25 °C, two hours), its console output streams onto the page, and a short while later the error and complexity appear. Nothing about a test run is recorded anywhere public and it never touches the hidden data. It catches the mistakes that would otherwise waste a submission: a mis-named file, a missing parameter file, a function that returns the wrong shape.

![Figure 3.2. The submit page. The test panel sits above the submission form; the checklist on the right says exactly what the zip must contain.](figures/submit.png)

![Figure 3.3. A finished test run. The console shows what the model printed, and the error is computed on the public cycle.](figures/dryrun-result.png)

The zip itself is simple. Its files must sit at the top level with no sub-folders. Exactly one of them must be the model: `Model.py` for Python, or `Model.m` or `Model.p` for MATLAB. Any parameter files the model loads (`.mat`, `.npz`, and so on) go alongside it. Section 5.1 shows what the model function looks like.

### 3.3 Submitting

Below the test panel the submission form asks for a model name, a description, the model type (Coulomb counter, Kalman filter, LSTM and so on), whether the model should be private, an optional contest to enter, and any co-authors. The form checks itself with the same rules the server uses, so a mistake is shown before the upload starts. Once submitted, the page shows the queue position, an estimated start time, whether a worker for the package's language is online, and then a live progress bar as the evaluation runs.

### 3.4 Reading results

The results page is arranged to answer *why* before *what*. It opens with a plain-language reading of the scorecard: which test contributes most to the score, whether the model generalises from the open cells to the hidden one, how it copes with cold, whether it recovers from a wrong starting point and a biased sensor. Every one of those sentences can be checked against the scorecard immediately below it.

![Figure 3.4. The top of a results page. The summary is generated from the numbers beneath it.](figures/results-top.png)

The scorecard lists the eighteen test-case rows with their RMSE, their weight, and the product of the two; the products add up to the weighted error at the bottom, so the score is never a mystery. Below that come the key traces: the drive cycles that separate estimators (cold and hot, the hidden cell, the robustness runs), each plotted against the true state of charge with zoom and pan. Everything else sits behind folds: all 144 cycles, the score history, and the downloads (the PDF report, the results as JSON, the full-resolution traces).

![Figure 3.5. The bottom of the scorecard and the first key trace. The weighted error is the sum of the weight × RMSE column.](figures/results-keycases.png)

### 3.5 The leaderboard

The leaderboard ranks every public, completed model by weighted error, lowest first. Ties break on the all-cells error, then on which was submitted earlier. The columns can be filtered by author, affiliation and model type, more columns can be revealed with the **Columns** picker, and the table can be downloaded as CSV. Clicking a model opens its results page; the **Compare** page overlays two to four models on the same charts.

![Figure 3.6. The leaderboard, with its explanatory panel expanded.](figures/leaderboard.png)

A signed-in user's private models appear in their own view with a dashed "ghost" rank, the position they *would* have, without moving anyone else. Results from an older version of the scoring maths stay listed but unranked, and their authors are asked to resubmit; packages are deleted after evaluation on purpose, so nothing can be re-run automatically.

### 3.6 Co-authors and contests

A co-author is invited by e-mail and accepts with a button; only then do they appear publicly and receive the results. A **contest** is a time-boxed event with its own leaderboard that freezes at the deadline. Entries must stay public, and their name and type freeze once the contest closes.

![Figure 3.7. A contest page: rules, timeline and its own leaderboard.](figures/contest.png)

**Files to open:** [submit-form.tsx](../../src/app/(app)/submit/submit-form.tsx) → [dry-run-panel.tsx](../../src/app/(app)/submit/dry-run-panel.tsx) → [submissions/[id]/page.tsx](../../src/app/(app)/submissions/[id]/page.tsx) → [leaderboard-table.tsx](../../src/components/leaderboard/leaderboard-table.tsx).

