# Move battery-soc-benchmark into a GitHub organization and add read-only collaborators.
#
#   powershell -ExecutionPolicy Bypass -File scripts\org-migration.ps1 -Org mcmaster-battery-group
#
# Run it AFTER creating the organization in the browser (there is no API to create one).
# What it does, in order:
#   1. checks the org exists and that you own it
#   2. transfers AhmadAli137/battery-soc-benchmark to the org (history, issues, PRs, deploy keys move with it)
#   3. turns on private-repo forking (off by default on new orgs; without it read-only people cannot open PRs)
#   4. invites the collaborators with the Read role - they can clone and open PRs from a fork, never push or merge
#   5. re-points this clone's git remote and reports what still needs doing by hand
#
# ASCII-only and no ErrorActionPreference=Stop on purpose: PowerShell 5.1 reads BOM-less UTF-8 as ANSI,
# and gh/vercel write banners to stderr which Stop would turn into terminating errors.

param(
  [Parameter(Mandatory = $true)][string]$Org,
  [string]$Repo = "battery-soc-benchmark",
  [string[]]$ReadOnly = @("aidanmclean", "PaarthKadakiaGitHub")
)

$old = "AhmadAli137/$Repo"
$new = "$Org/$Repo"

Write-Host "1/6  Checking the organization..."
$o = gh api "orgs/$Org" 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "FAILED: no organization '$Org' (create it first at https://github.com/account/organizations/new)."
  Write-Host "        Use the org's URL name here, not its display name - e.g. -Org mcmaster-battery-group"
  exit 1
}
Write-Host "  found: $((($o | ConvertFrom-Json).login))"

Write-Host "2/6  Transferring $old -> $new ..."
$already = gh api "repos/$new" 2>$null
if ($LASTEXITCODE -eq 0) {
  Write-Host "  already owned by the org - skipping transfer"
} else {
  $t = gh api -X POST "repos/$old/transfer" -f new_owner="$Org" 2>&1
  if ($LASTEXITCODE -ne 0) { Write-Host "FAILED: transfer refused:"; $t | ForEach-Object { Write-Host "  $_" }; exit 1 }
  $ok = $false
  foreach ($i in 1..20) {
    Start-Sleep -Seconds 3
    $null = gh api "repos/$new" 2>$null
    if ($LASTEXITCODE -eq 0) { $ok = $true; break }
  }
  if (-not $ok) { Write-Host "FAILED: transfer did not complete within 60 s - check github.com."; exit 1 }
  Write-Host "  transferred"
}

Write-Host "3/6  Allowing forks of private repos (org + repo level)..."
$null = gh api -X PATCH "orgs/$Org" -F members_can_fork_private_repositories=true 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host "  WARNING: could not set the org policy - set it by hand in Settings > Member privileges" }
$null = gh api -X PATCH "repos/$new" -F allow_forking=true 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host "  WARNING: could not set repo-level forking" }

Write-Host "4/6  Inviting read-only collaborators..."
foreach ($u in $ReadOnly) {
  $r = gh api -X PUT "repos/$new/collaborators/$u" -f permission=pull 2>&1
  if ($LASTEXITCODE -eq 0) { Write-Host "  $u : invited with Read access" }
  else { Write-Host "  $u : FAILED"; $r | ForEach-Object { Write-Host "    $_" } }
}

Write-Host "5/6  Re-pointing this clone's git remote..."
git remote set-url origin "https://github.com/$new.git"
git remote -v | Select-Object -First 1 | ForEach-Object { Write-Host "  $_" }

Write-Host "6/6  Checking what the transfer did not carry over..."
$secrets = gh secret list -R $new 2>&1
if ($LASTEXITCODE -eq 0 -and ($secrets -match "OPS_HEALTH_URL")) {
  Write-Host "  OPS_HEALTH_URL secret: still present"
} else {
  Write-Host "  OPS_HEALTH_URL secret: MISSING - re-run scripts\ops-alert-setup.ps1 to restore worker-outage alerting"
}

Write-Host ""
Write-Host "Done. Remaining manual steps:"
Write-Host "  * Vercel: Project Settings > Git - reconnect the repository (it still points at the old owner)."
Write-Host "  * Org profile: Settings > Profile - set the display name to 'McMaster Battery Group'."
Write-Host "  * VM: ssh ubuntu@134.87.10.197 'sudo -u socbench git -C /opt/socbench fetch' to confirm the deploy key still works."
Write-Host "  * Collaborators must accept the e-mailed invitation before their access starts."
