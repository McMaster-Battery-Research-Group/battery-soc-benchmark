#!/usr/bin/env bash
# Battery SOC Benchmark — one-time import of the hosted (Supabase) database into the PostgreSQL on the Arbutus web host.
# Run ON THE WEB HOST, in your own terminal (it asks for the source connection string without echoing it):
#   sudo /opt/socbench/scripts/cutover-import-db.sh
#
# Source connection string: Supabase → Connect → "Session pooler" (port 5432). The "Direct connection" is IPv6-only
# and this host has no IPv6; the "Transaction pooler" (6543) cannot run pg_dump.
#
#   1. checks the source is reachable; installs a pg_dump at least as new as the source server if needed (PGDG)
#   2. stops the site, takes a safety dump of the local database
#   3. empties the local tables (the schema was already created by `prisma db push`) and copies the DATA only
#   4. compares row counts table by table, restarts the site
# Safe to re-run: every run starts from empty local tables. The source is only read.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "run with sudo"; exit 1; }
log() { echo "[import $(date -u +%H:%M:%S)] $*"; }
BACKUPS=/var/lib/socbench-backups
PSQL_LOCAL=(sudo -u postgres psql -v ON_ERROR_STOP=1 -qAt socbench)

read -rsp "Source connection string (Session pooler, not shown): " SRC; echo
[[ "$SRC" == postgres* ]] || { echo "that does not look like a postgresql:// URL"; exit 1; }
SRC="${SRC%%\?*}"   # pg_dump does not understand Prisma's ?pgbouncer=… parameters

log "source check"
SRC_VER=$(psql "$SRC" -qAtc "show server_version_num") || { echo "cannot connect to the source"; exit 1; }
SRC_MAJOR=$((SRC_VER / 10000))
LOCAL_MAJOR=$(pg_dump --version | grep -oE '[0-9]+' | head -1)
echo "source PostgreSQL $SRC_MAJOR, local pg_dump $LOCAL_MAJOR"
PGDUMP=pg_dump
if [ "$SRC_MAJOR" -gt "$LOCAL_MAJOR" ]; then
  log "installing postgresql-client-$SRC_MAJOR (pg_dump must not be older than the server it reads)"
  install -d /usr/share/postgresql-common/pgdg
  curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc
  echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(. /etc/os-release && echo "$VERSION_CODENAME")-pgdg main" >/etc/apt/sources.list.d/pgdg.list
  apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "postgresql-client-$SRC_MAJOR" >/dev/null
  PGDUMP=/usr/lib/postgresql/$SRC_MAJOR/bin/pg_dump
fi

TABLES=$("${PSQL_LOCAL[@]}" -c "select string_agg(format('%I', tablename), ' ') from pg_tables where schemaname='public'")
[ -n "$TABLES" ] || { echo "the local database has no tables — run web-update.sh --force first"; exit 1; }
MISSING=$(psql "$SRC" -qAtc "select string_agg(tablename, ', ') from pg_tables where schemaname='public' and tablename not in ($(sed "s/\([^ ]*\)/'\1'/g; s/ /,/g" <<<"$TABLES" | tr -d '"'))")
[ -z "$MISSING" ] || echo "note: source tables with no local counterpart are skipped: $MISSING"

echo "This EMPTIES the local database on $(hostname) and refills it from the source."
read -rp "Type IMPORT to continue: " ok; [ "$ok" = IMPORT ] || { echo "cancelled"; exit 1; }

log "stopping the site; safety dump of the local database"
systemctl stop socbench-web || true
sudo -u postgres pg_dump -Fc socbench >"$BACKUPS/socbench-before-import-$(date -u +%FT%H%M).dump"

log "emptying local tables"
"${PSQL_LOCAL[@]}" -c "truncate $(sed 's/ /, /g' <<<"$TABLES") restart identity cascade"

log "copying data (public schema, data only)"
TABLE_ARGS=(); for t in $TABLES; do TABLE_ARGS+=(--table="public.$t"); done
# transaction_timeout is emitted by pg_dump 17+ and unknown to older servers
"$PGDUMP" "$SRC" --data-only --no-owner --no-privileges --disable-triggers "${TABLE_ARGS[@]}" \
  | grep -v '^SET transaction_timeout' \
  | "${PSQL_LOCAL[@]}" >/dev/null

log "row counts (source / local)"
bad=0
for t in $TABLES; do
  s=$(psql "$SRC" -qAtc "select count(*) from public.$t"); l=$("${PSQL_LOCAL[@]}" -c "select count(*) from public.$t")
  mark=ok; [ "$s" = "$l" ] || { mark=MISMATCH; bad=1; }
  printf '  %-28s %8s %8s  %s\n' "$t" "$s" "$l" "$mark"
done
"${PSQL_LOCAL[@]}" -c "analyze" >/dev/null
unset SRC

systemctl start socbench-web
[ "$bad" = 0 ] && log "DONE — all tables match; the site is running on the imported data" || { log "FINISHED WITH MISMATCHES — someone may have written to the source during the copy; re-run"; exit 1; }
