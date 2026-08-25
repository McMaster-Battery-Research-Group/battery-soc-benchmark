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
$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$task = "SOC Benchmark Worker"
$npm = (Get-Command npm.cmd).Source

# Environment: the worker reads .env from the repo (production values: DATABASE_URL,
# DIRECT_URL, STORAGE=blob, BLOB_READ_WRITE_TOKEN, EVALUATOR=real, SMTP_*, ...).
$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$npm`" run worker >> `"$repo\worker.log`" 2>&1" -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew `
  -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -DontStopOnIdleEnd
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

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
