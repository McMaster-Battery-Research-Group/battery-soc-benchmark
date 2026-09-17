# Second, optional history pass: replace infrastructure identifiers (the worker VM's addresses and
# OpenStack names) with placeholders in every commit, then force-push. Run from the repository root
# after purge-internal-docs-history.ps1 and before making the repository public.
#
#   powershell -ExecutionPolicy Bypass -File scripts\scrub-history-text.ps1

$repo = "https://github.com/McMaster-Battery-Research-Group/battery-soc-benchmark.git"
$rules = @(
  "<vm-address>==><vm-address>",
  "<vm-internal-address>==><vm-internal-address>",
  "<vm-instance>==><vm-instance>",
  "<cloud-project>==><cloud-project>"
)

$dirty = git status --porcelain
if ($dirty) { Write-Host "Working tree is not clean; commit or stash first:"; Write-Host $dirty; exit 1 }
python -m git_filter_repo --version | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host "git-filter-repo is not installed: pip install git-filter-repo"; exit 1 }

$rulesFile = Join-Path $env:TEMP "socbench-scrub-rules.txt"
[System.IO.File]::WriteAllLines($rulesFile, $rules)
Write-Host "Replacing in every commit:"; $rules | ForEach-Object { Write-Host "  $_" }
python -m git_filter_repo --replace-text $rulesFile --force
if ($LASTEXITCODE -ne 0) { Write-Host "filter-repo failed"; exit 1 }
Remove-Item $rulesFile -ErrorAction SilentlyContinue

git remote remove origin 2>$null
git remote add origin $repo

$left = git grep -l "<vm-address>" $(git rev-list --all) 2>$null
if ($left) { Write-Host "Address still present in history:"; Write-Host $left; exit 1 }
Write-Host "History scrubbed. Commits now: $(git rev-list --all --count)"

Write-Host "Force-pushing main (the pre-push smoke test will run)..."
git push --force origin main
if ($LASTEXITCODE -ne 0) { Write-Host "push failed"; exit 1 }
Write-Host "Done."
