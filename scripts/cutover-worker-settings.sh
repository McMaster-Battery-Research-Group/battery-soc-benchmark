#!/usr/bin/env bash
# Battery SOC Benchmark — prints the lines the evaluation worker needs in /etc/socbench/worker.env to use THIS web host's
# database and package storage instead of the hosted ones. Run ON THE WEB HOST in your own terminal (the output contains secrets):
#   sudo /opt/socbench/scripts/cutover-worker-settings.sh
# On the worker: sudo nano /etc/socbench/worker.env → replace the lines with the same names, delete the SUPABASE_* lines,
# then: sudo systemctl restart socbench-worker && journalctl -u socbench-worker -n 20
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "run with sudo"; exit 1; }
ENVFILE=/etc/socbench/web.env
val() { grep -E "^$1=" "$ENVFILE" | head -1 | cut -d= -f2- | tr -d '"'; }
PW=$(cat /etc/socbench/db-password)
IP=$(hostname -I | tr ' ' '\n' | grep -E '^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)' | head -1)
TOKEN=$(val STORAGE_REMOTE_TOKEN); SITE=$(val NEXT_PUBLIC_SITE_URL)
[ -n "$TOKEN" ] || { echo "STORAGE_REMOTE_TOKEN is not set in $ENVFILE"; exit 1; }
cat <<OUT
DATABASE_URL="postgresql://socbench:${PW}@${IP}:5432/socbench?sslmode=require"
DIRECT_URL="postgresql://socbench:${PW}@${IP}:5432/socbench?sslmode=require"
STORAGE="remote"
STORAGE_REMOTE_URL="${SITE}"
STORAGE_REMOTE_TOKEN="${TOKEN}"
NEXT_PUBLIC_SITE_URL="${SITE}"
OUT
