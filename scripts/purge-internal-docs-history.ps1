# Rewrites this repository's history to remove the six internal documents that were moved to
# socbench-internal, then force-pushes main. Run ONCE, from the repository root, before making
# the repository public. Afterwards every other clone must be re-cloned (only Read collaborators
# have clones today; no forks exist).
#
#   powershell -ExecutionPolicy Bypass -File scripts\purge-internal-docs-history.ps1
#
# Requires: python with git-filter-repo (pip install git-filter-repo) and a clean working tree.

$repo = "https://github.com/McMaster-Battery-Research-Group/battery-soc-benchmark.git"
$paths = @(
  "docs/compliance.md",
  "docs/drac-migration.md",
  "docs/evaluator-vs-original-tool.md",
  "docs/issue-tracker-2026-08-28.csv",
  "docs/roadmap.md",
  "docs/security.md"
)

$dirty = git status --porcelain
if ($dirty) { Write-Host "Working tree is not clean; commit or stash first:"; Write-Host $dirty; exit 1 }

python -m git_filter_repo --version | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host "git-filter-repo is not installed: pip install git-filter-repo"; exit 1 }

$args = @("-m", "git_filter_repo", "--invert-paths", "--force")
foreach ($p in $paths) { $args += "--path"; $args += $p }
Write-Host "Rewriting history to drop: $($paths -join ', ')"
& python @args
if ($LASTEXITCODE -ne 0) { Write-Host "filter-repo failed"; exit 1 }

# filter-repo removes the remote on purpose; put it back
git remote remove origin 2>$null
git remote add origin $repo

$left = git log --all --name-only --pretty=format: | Sort-Object -Unique | Where-Object { $paths -contains $_ }
if ($left) { Write-Host "Still present in history:"; Write-Host $left; exit 1 }
Write-Host "History clean. Commits now: $(git rev-list --all --count)"

Write-Host "Force-pushing main (the pre-push smoke test will run)..."
git push --force origin main
if ($LASTEXITCODE -ne 0) { Write-Host "push failed"; exit 1 }
git push --force --tags origin 2>$null
Write-Host "Done. Tell Claude the purge is complete so the repository can be made public."
