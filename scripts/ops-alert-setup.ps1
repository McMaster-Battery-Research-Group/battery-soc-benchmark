# One-time setup for worker-outage alerting (run it yourself - it handles the secret so the
# assistant never does):   powershell -ExecutionPolicy Bypass -File scripts\ops-alert-setup.ps1
#
# It generates a random token, writes it as OPS_HEALTH_TOKEN into /etc/socbench/web.env on
# socbench-web (Arbutus), redeploys the site so it takes effect, stores the full ping URL as the
# OPS_HEALTH_URL secret on the GitHub repo (used by .github/workflows/worker-health.yml every
# 10 minutes), and tests the endpoint. Needs: SSH to socbench-web (McMaster network or VPN),
# `gh` logged in. Re-running rotates the token safely (both sides are updated together).
#
# The token goes to the server over SSH stdin, never on a command line.
#
# PowerShell 5.1 quirks handled here: ASCII-only (BOM-less files are read as ANSI), no
# $ErrorActionPreference=Stop (native tools print progress to stderr, which Stop turns into a
# terminating error) - failures are detected via exit codes instead.

$site = "https://batterysocbenchmark.ca"
$sshTarget = "ubuntu@134.87.12.129"
$repo = "McMaster-Battery-Research-Group/battery-soc-benchmark"

$token = -join ((1..48) | ForEach-Object { "0123456789abcdef"[(Get-Random -Maximum 16)] })

Write-Host "1/4  Writing OPS_HEALTH_TOKEN to /etc/socbench/web.env on socbench-web and redeploying (a few minutes)..."
$remote = @"
set -e
f=/etc/socbench/web.env
t=$token
if grep -q '^OPS_HEALTH_TOKEN=' "`$f"; then sed -i "s|^OPS_HEALTH_TOKEN=.*|OPS_HEALTH_TOKEN=`$t|" "`$f"; else printf 'OPS_HEALTH_TOKEN=%s\n' "`$t" >> "`$f"; fi
/opt/socbench/scripts/web-update.sh --force
"@
$remote | ssh -T $sshTarget "tr -d '\r' | sudo bash -s" | Select-Object -Last 5 | ForEach-Object { Write-Host "  $_" }
if ($LASTEXITCODE -ne 0) { Write-Host "FAILED: could not update socbench-web - are you on the McMaster network / VPN?"; exit 1 }

Write-Host "2/4  Setting OPS_HEALTH_URL secret on $repo..."
$out = $(gh secret set OPS_HEALTH_URL -R $repo -b "$site/api/ops/worker-health?token=$token" 2>&1)
$out | ForEach-Object { Write-Host "  $_" }
if ($LASTEXITCODE -ne 0) { Write-Host "FAILED: gh secret set - is gh logged in?"; exit 1 }

Write-Host "3/4  Testing the endpoint..."
Start-Sleep -Seconds 10
try {
  $r = Invoke-RestMethod "$site/api/ops/worker-health?token=$token" -TimeoutSec 30
  Write-Host ("Health check answered: ok={0} problems=[{1}]" -f $r.ok, ($r.problems -join "; "))
  if (-not $r.ok) { Write-Host "That problem is real - an alert e-mail was just sent to admins with 'Worker outages' enabled." }
} catch {
  Write-Host "Endpoint did not answer yet - test manually in a minute:"
  Write-Host "  Invoke-RestMethod `"$site/api/ops/worker-health?token=$token`""
}

Write-Host "4/4  Triggering one GitHub Action run..."
gh workflow run worker-health.yml -R $repo
Write-Host ""
Write-Host "Done. The GitHub Action 'Worker health' now pings $site every 10 minutes."
Write-Host "Check the run:  gh run list --workflow worker-health.yml -R $repo -L 1"
