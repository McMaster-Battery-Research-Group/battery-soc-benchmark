# One-time setup for worker-outage alerting (run it yourself - it handles the secret so the
# assistant never does):   powershell -ExecutionPolicy Bypass -File scripts\ops-alert-setup.ps1
#
# It generates a random token, stores it as the OPS_HEALTH_TOKEN env var on Vercel (production),
# stores the full ping URL as the OPS_HEALTH_URL secret on the GitHub repo (used by
# .github/workflows/worker-health.yml every 10 minutes), and redeploys the site so the new env
# var takes effect. Needs: `npx vercel` logged in + project linked, `gh` logged in.
# Re-running rotates the token safely (both sides are updated together).
#
# PowerShell 5.1 quirks handled here: ASCII-only (BOM-less files are read as ANSI), no
# $ErrorActionPreference=Stop (the Vercel CLI prints its banner to stderr, which Stop turns into
# a terminating error) - failures are detected via exit codes instead, with stderr stringified.

$site = "https://battery-soc-benchmark.vercel.app"
$repo = "AhmadAli137/battery-soc-benchmark"

$token = -join ((1..48) | ForEach-Object { "0123456789abcdef"[(Get-Random -Maximum 16)] })

Write-Host "1/4  Setting OPS_HEALTH_TOKEN on Vercel (production)..."
$null = $(npx vercel env rm OPS_HEALTH_TOKEN production --yes 2>&1)   # ok if it did not exist
$out = $($token | npx vercel env add OPS_HEALTH_TOKEN production 2>&1)
$out | ForEach-Object { Write-Host "  $_" }
if ($LASTEXITCODE -ne 0) { Write-Host "FAILED: vercel env add - is the CLI logged in and the project linked?"; exit 1 }

Write-Host "2/4  Setting OPS_HEALTH_URL secret on $repo..."
$out = $(gh secret set OPS_HEALTH_URL -R $repo -b "$site/api/ops/worker-health?token=$token" 2>&1)
$out | ForEach-Object { Write-Host "  $_" }
if ($LASTEXITCODE -ne 0) { Write-Host "FAILED: gh secret set - is gh logged in?"; exit 1 }

Write-Host "3/4  Redeploying so the new env var takes effect..."
$out = $(npx vercel redeploy $site 2>&1)
$out | Select-Object -Last 3 | ForEach-Object { Write-Host "  $_" }
if ($LASTEXITCODE -ne 0) { Write-Host "FAILED: vercel redeploy - run 'npx vercel redeploy $site' manually."; exit 1 }

Write-Host "4/4  Testing the endpoint..."
Start-Sleep -Seconds 20
try {
  $r = Invoke-RestMethod "$site/api/ops/worker-health?token=$token" -TimeoutSec 30
  Write-Host ("Health check answered: ok={0} problems=[{1}]" -f $r.ok, ($r.problems -join "; "))
  if (-not $r.ok) { Write-Host "That problem is real - an alert e-mail was just sent to admins with 'Worker outages' enabled." }
} catch {
  Write-Host "Endpoint not ready yet (deploy may still be building) - test manually in a minute:"
  Write-Host "  Invoke-RestMethod `"$site/api/ops/worker-health?token=$token`""
}

Write-Host ""
Write-Host "Done. The GitHub Action 'Worker health' now pings every 10 minutes."
Write-Host "Trigger one run now:  gh workflow run worker-health.yml -R $repo"
