<#
.SYNOPSIS
  Keeps the evaluation worker alive on this Windows laptop.

  Registers a Scheduled Task "SOC Benchmark Worker" that starts `npm run worker`
  at every logon, restarts it if it crashes, and never stops it for being
  "idle". Also disables sleep while plugged in so queued submissions keep
  evaluating with the lid closed.

  Run once from an elevated PowerShell in the repo folder:
    Set-ExecutionPolicy -Scope Process Bypass; .\scripts\install-worker-task.ps1

  Remove with:
    Unregister-ScheduledTask -TaskName "SOC Benchmark Worker" -Confirm:$false
#>
param(
  # Run the worker as a separate low-privilege local account instead of your own
  # (recommended: submissions are untrusted code). Create it first:
  #   New-LocalUser socbench -Password (Read-Host -AsSecureString) -PasswordNeverExpires
  #   icacls <repo> /grant "socbench:(OI)(CI)RX"      # read the code
  #   icacls <repo>\.env.production /grant "socbench:R"
  #   icacls <blind-data dir> /grant "socbench:(OI)(CI)R"
  # then: .\scripts\install-worker-task.ps1 -RunAsUser socbench
  [string]$RunAsUser = $env:USERNAME
)
$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$task = "SOC Benchmark Worker"
$npm = (Get-Command npm.cmd).Source

# Environment: the worker reads .env from the repo (production values: DATABASE_URL,
# DIRECT_URL, STORAGE=supabase, SUPABASE_URL, SUPABASE_SERVICE_KEY, SMTP_*, ...).
# Uses .env.production when present (the live site), else .env (local dev).
$script = if (Test-Path (Join-Path $repo ".env.production")) { "worker:prod" } else { "worker" }
$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$npm`" run $script >> `"$repo\worker.log`" 2>&1" -WorkingDirectory $repo
$trigger = if ($RunAsUser -eq $env:USERNAME) { New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME } else { New-ScheduledTaskTrigger -AtStartup }
$settings = New-ScheduledTaskSettingsSet `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew `
  -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -DontStopOnIdleEnd
$principal = if ($RunAsUser -eq $env:USERNAME) { New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited } else { New-ScheduledTaskPrincipal -UserId $RunAsUser -LogonType Password -RunLevel Limited }
# NOTE: with -RunAsUser the account needs "Log on as a batch job" (secpol.msc) and Docker Desktop
# access (add it to the local "docker-users" group).

Unregister-ScheduledTask -TaskName $task -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $task -Action $action -Trigger $trigger -Settings $settings -Principal $principal | Out-Null
Start-ScheduledTask -TaskName $task
Write-Host "Registered and started '$task' (log: $repo\worker.log)."

# Power: never sleep on AC, keep the lid-close action as 'do nothing' on AC.
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0
powercfg /setactive SCHEME_CURRENT
Write-Host "Power plan updated: no sleep/hibernate while plugged in; closing the lid does nothing on AC."
Write-Host "Check liveness any time on the Submit page ('Evaluator online') or with: Get-ScheduledTask '$task' | Get-ScheduledTaskInfo"
