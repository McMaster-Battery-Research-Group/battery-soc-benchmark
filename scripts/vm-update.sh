#!/usr/bin/env bash
# Keeps the Arbutus evaluation worker in sync with `main` — run by socbench-update.timer every 10 minutes
# (see docs/drac-migration.md → Runbook). Idempotent; safe to run by hand: sudo /opt/socbench/scripts/vm-update.sh
#
#   1. fetch; exit quietly if /opt/socbench already matches origin/main
#   2. pull; npm ci only if package-lock.json changed; prisma generate only if the schema changed
#   3. rebuild the sandbox image only if evaluator/ changed
#   4. restart the worker — but only when it is idle (no socbench-* container running); otherwise try again next tick
set -euo pipefail
REPO=/opt/socbench
USER_=socbench
log() { echo "[vm-update $(date -u +%FT%TZ)] $*"; }
run() { sudo -u "$USER_" -H bash -c "cd $REPO && $*"; }

before=$(run 'git rev-parse HEAD')
run 'git fetch -q origin main'
after=$(run 'git rev-parse origin/main')
if [ "$before" = "$after" ]; then
  # code is current; a restart may still be pending from an earlier tick
  if [ -f /run/socbench-restart-pending ]; then :; else exit 0; fi
else
  log "updating $before -> $after"
  # deploy target: no local edits are ever expected here, so hard-reset (a stray chmod or edit must not block updates)
  run 'git reset -q --hard origin/main'
  changed=$(run "git diff --name-only $before $after")
  if grep -q '^package-lock.json$' <<<"$changed"; then log "dependencies changed — npm ci"; run 'npm ci --no-audit --no-fund --loglevel=error'; fi
  if grep -q '^prisma/schema.prisma$' <<<"$changed"; then log "schema changed — prisma generate"; run 'npx prisma generate >/dev/null'; fi
  if grep -q '^evaluator/' <<<"$changed"; then log "evaluator/ changed — rebuilding sandbox image"; docker build -q -t socbench-eval "$REPO/evaluator" >/dev/null; fi
  # MATLAB image (only if it has been built on this host): harness/shim changes → rebuild on the MathWorks base
  if grep -qE '^(evaluator/|matlab/)' <<<"$changed" && docker image inspect socbench-eval-matlab:latest >/dev/null 2>&1; then
    log "rebuilding socbench-eval-matlab"
    docker build -q -t socbench-eval-matlab -f "$REPO/evaluator/Dockerfile.matlab"       --build-arg MATLAB_UID="$(id -u $USER_)" --build-arg MATLAB_GID="$(id -g $USER_)" "$REPO" >/dev/null
  fi
  touch /run/socbench-restart-pending
fi

# restart only when idle: an evaluation in flight would be aborted and re-queued (work lost)
if docker ps --format '{{.Names}}' | grep -q '^socbench-'; then
  log "worker busy — restart deferred to the next tick"
  exit 0
fi
systemctl restart socbench-worker
rm -f /run/socbench-restart-pending
log "worker restarted on $(run 'git log --format=%h -1')"
