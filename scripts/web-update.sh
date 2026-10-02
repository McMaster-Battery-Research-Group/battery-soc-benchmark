#!/usr/bin/env bash
# Keeps the Arbutus web host in sync with `main` — run by socbench-web-update.timer every 10 minutes.
# Idempotent; safe to run by hand:  sudo /opt/socbench/scripts/web-update.sh          (only acts when main has moved)
#                                   sudo /opt/socbench/scripts/web-update.sh --force  (first deployment, or after editing web.env)
#
#   1. fetch; exit quietly if /opt/socbench already matches origin/main
#   2. pull; npm ci only if package-lock.json changed
#   3. prisma db push when the schema changed (additive changes only — a destructive change stops here and is applied by hand)
#   4. next build with /etc/socbench/web.env loaded (NEXT_PUBLIC_* values are fixed at build time) into .next-build,
#      while the running site keeps serving .next; on success swap the two and restart
set -euo pipefail
REPO=/opt/socbench
USER_=socbench
ENVFILE=/etc/socbench/web.env
FORCE=0; [ "${1:-}" = "--force" ] && FORCE=1
log() { echo "[web-update $(date -u +%FT%TZ)] $*"; }
run() { sudo -u "$USER_" -H bash -c "cd $REPO && set -a && . $ENVFILE && set +a && $*"; }

[ -f "$ENVFILE" ] || { log "$ENVFILE is missing — nothing to do"; exit 0; }

before=$(sudo -u "$USER_" git -C "$REPO" rev-parse HEAD)
sudo -u "$USER_" git -C "$REPO" fetch -q origin main
after=$(sudo -u "$USER_" git -C "$REPO" rev-parse origin/main)
if [ "$before" = "$after" ] && [ "$FORCE" = 0 ]; then exit 0; fi

changed=""
if [ "$before" != "$after" ]; then
  log "updating $before -> $after"
  # deploy target: no local edits are ever expected here, so hard-reset
  sudo -u "$USER_" git -C "$REPO" reset -q --hard origin/main
  changed=$(sudo -u "$USER_" git -C "$REPO" diff --name-only "$before" "$after")
fi

if [ "$FORCE" = 1 ] || grep -q '^package-lock.json$' <<<"$changed"; then log "npm ci"; run 'npm ci --no-audit --no-fund --loglevel=error'; fi
if [ "$FORCE" = 1 ] || grep -q '^prisma/schema.prisma$' <<<"$changed"; then
  log "prisma db push"
  run 'npx prisma generate >/dev/null && npx prisma db push --skip-generate'
fi

log "next build"
# Build beside the live build: rebuilding .next in place breaks pages for the ~30 s the build takes.
run 'rm -rf .next-build && NODE_ENV=production NEXT_DIST_DIR=.next-build npx next build >/tmp/socbench-build.log 2>&1' || { log "BUILD FAILED — the site was not restarted; see /tmp/socbench-build.log"; tail -20 /tmp/socbench-build.log; exit 1; }

# Carry the live build's static files (content-hashed, so no clashes) into the new one, so browser tabs opened
# before this deploy can still load their scripts. Only files from up to a day before the live build was made
# are carried, and cp -p keeps their original mtime, so older carried-forward files age out.
run 'if [ -f .next/BUILD_ID ]; then cd .next/static && find . -type f -newermt "@$(( $(stat -c %Y ../BUILD_ID) - 86400 ))" -exec cp -pn --parents {} ../../.next-build/static/ \; ; fi'
run 'rm -rf .next-old && { [ ! -d .next ] || mv .next .next-old; } && mv .next-build .next'

systemctl restart socbench-web
sleep 3
systemctl is-active --quiet socbench-web && log "site restarted on $(sudo -u "$USER_" git -C "$REPO" log --format=%h -1)" || { log "socbench-web did not start"; journalctl -u socbench-web -n 20 --no-pager; exit 1; }
run 'rm -rf .next-old'
