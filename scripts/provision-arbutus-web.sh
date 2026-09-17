#!/usr/bin/env bash
# Battery SOC Benchmark — base provisioning for the web + database host on an Alliance Cloud (Arbutus) Ubuntu 24.04 VM.
# Usage (on the VM, as the default sudo user):
#   scp scripts/provision-arbutus-web.sh ubuntu@<ip>: && ssh ubuntu@<ip> ./provision-arbutus-web.sh
# Optional environment:
#   SOCBENCH_DOMAIN   public host name served over HTTPS          (default batterysocbenchmark.ca)
#   SOCBENCH_WORKER   private address of the evaluation worker,   (default 192.168.201.184)
#                     the only remote host allowed to reach PostgreSQL
# Idempotent: safe to re-run. Holds NO secrets and never the blinded dataset (that stays on the worker).
# The site starts only once /etc/socbench/web.env exists: write it, then run  sudo /opt/socbench/scripts/web-update.sh --force
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
DOMAIN="${SOCBENCH_DOMAIN:-batterysocbenchmark.ca}"
WORKER="${SOCBENCH_WORKER:-192.168.201.184}"
log() { echo "[provision $(date -u +%H:%M:%S)] $*"; }

log "sudo check"; sudo -n true

log "apt: base packages"
sudo apt-get update -qq
sudo apt-get install -y -qq ca-certificates curl gnupg git ufw unattended-upgrades apt-listchanges debian-keyring debian-archive-keyring apt-transport-https >/dev/null

log "node: 22.x from NodeSource"
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1)" != "v22" ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - >/dev/null
  sudo apt-get install -y -qq nodejs >/dev/null
fi
node -v; npm -v

log "caddy: official repository (HTTPS certificates are obtained and renewed automatically)"
if ! command -v caddy >/dev/null; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt-get update -qq
  sudo apt-get install -y -qq caddy >/dev/null
fi
caddy version

log "postgresql"
sudo apt-get install -y -qq postgresql postgresql-contrib >/dev/null
PGVER=$(ls /etc/postgresql | sort -n | tail -1)
PGCONF=/etc/postgresql/$PGVER/main
PRIVATE_IP=$(hostname -I | tr ' ' '\n' | grep -E '^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)' | head -1)
echo "PostgreSQL $PGVER, private address $PRIVATE_IP"

log "service user socbench (no login shell)"
id socbench >/dev/null 2>&1 || sudo useradd --system --create-home --home-dir /var/lib/socbench --shell /usr/sbin/nologin socbench
sudo install -d -m 0750 -o socbench -g socbench /etc/socbench /var/lib/socbench/uploads
sudo install -d -m 0700 -o postgres -g postgres /var/lib/socbench-backups

log "database role + database (the password is generated here and stored only in /etc/socbench/db-password)"
if ! sudo test -f /etc/socbench/db-password; then
  openssl rand -hex 24 | sudo tee /etc/socbench/db-password >/dev/null
  sudo chown root:socbench /etc/socbench/db-password; sudo chmod 0640 /etc/socbench/db-password
fi
DBPASS=$(sudo cat /etc/socbench/db-password)
sudo -u postgres psql -v ON_ERROR_STOP=1 -q <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'socbench') THEN CREATE ROLE socbench LOGIN; END IF;
END \$\$;
ALTER ROLE socbench WITH PASSWORD '$DBPASS';
SQL
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='socbench'" | grep -q 1 || sudo -u postgres createdb -O socbench socbench

log "postgresql: listen on localhost + the private network; the worker is the only remote client, TLS required"
sudo tee "$PGCONF/conf.d/socbench.conf" >/dev/null <<CONF
listen_addresses = 'localhost,$PRIVATE_IP'
ssl = on
password_encryption = scram-sha-256
CONF
if ! sudo grep -q "socbench worker" "$PGCONF/pg_hba.conf"; then
  echo "hostssl socbench socbench $WORKER/32 scram-sha-256   # socbench worker" | sudo tee -a "$PGCONF/pg_hba.conf" >/dev/null
fi
sudo systemctl restart postgresql

log "nightly database dump (kept 14 days) -> /var/lib/socbench-backups"
sudo tee /etc/systemd/system/socbench-db-backup.service >/dev/null <<'UNIT'
[Unit]
Description=Nightly dump of the Battery SOC Benchmark database

[Service]
Type=oneshot
User=postgres
ExecStart=/bin/bash -c 'pg_dump -Fc socbench > /var/lib/socbench-backups/socbench-$$(date -u +%%F).dump && find /var/lib/socbench-backups -name "socbench-*.dump" -mtime +14 -delete'
UNIT
sudo tee /etc/systemd/system/socbench-db-backup.timer >/dev/null <<'UNIT'
[Unit]
Description=Nightly database dump

[Timer]
OnCalendar=*-*-* 08:30:00 UTC
Persistent=true

[Install]
WantedBy=timers.target
UNIT

log "repository -> /opt/socbench (public, read-only over HTTPS)"
if [ ! -d /opt/socbench/.git ]; then
  sudo install -d -m 0755 -o socbench -g socbench /opt/socbench
  sudo -u socbench git clone -q https://github.com/McMaster-Battery-Research-Group/battery-soc-benchmark.git /opt/socbench
else
  sudo -u socbench git -C /opt/socbench pull -q --ff-only
fi
sudo -u socbench -H bash -c 'cd /opt/socbench && npm ci --no-audit --no-fund --loglevel=error'
sudo -u socbench git -C /opt/socbench log --format='%h %s' -1

log "systemd unit socbench-web (not started until /etc/socbench/web.env exists and the site has been built)"
sudo tee /etc/systemd/system/socbench-web.service >/dev/null <<'UNIT'
[Unit]
Description=Battery SOC Benchmark web application (Next.js)
After=network-online.target postgresql.service
Wants=network-online.target
ConditionPathExists=/etc/socbench/web.env
ConditionPathExists=/opt/socbench/.next/BUILD_ID

[Service]
Type=simple
User=socbench
Group=socbench
WorkingDirectory=/opt/socbench
EnvironmentFile=/etc/socbench/web.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3000
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/opt/socbench/.next /var/lib/socbench
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT

log "auto-update timer (pull main every 10 min, rebuild, restart)"
sudo tee /etc/systemd/system/socbench-web-update.service >/dev/null <<'UNIT'
[Unit]
Description=Update the Battery SOC Benchmark web application from git (main)
After=network-online.target
ConditionPathExists=/etc/socbench/web.env

[Service]
Type=oneshot
ExecStart=/bin/bash /opt/socbench/scripts/web-update.sh
UNIT
sudo tee /etc/systemd/system/socbench-web-update.timer >/dev/null <<'UNIT'
[Unit]
Description=Check GitHub for web application updates every 10 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=10min
RandomizedDelaySec=60

[Install]
WantedBy=timers.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable socbench-web socbench-web-update.timer socbench-db-backup.timer >/dev/null 2>&1
sudo systemctl start socbench-web-update.timer socbench-db-backup.timer

log "caddy: https://$DOMAIN -> 127.0.0.1:3000"
sudo tee /etc/caddy/Caddyfile >/dev/null <<CADDY
$DOMAIN {
	encode zstd gzip
	request_body {
		max_size 60MB
	}
	reverse_proxy 127.0.0.1:3000
}

www.$DOMAIN {
	redir https://$DOMAIN{uri} permanent
}
CADDY
sudo systemctl enable caddy >/dev/null 2>&1
sudo systemctl reload caddy || sudo systemctl restart caddy

log "firewall: SSH, HTTP, HTTPS from anywhere; PostgreSQL from the worker only"
sudo ufw --force default deny incoming >/dev/null
sudo ufw --force default allow outgoing >/dev/null
sudo ufw allow 22/tcp >/dev/null
sudo ufw allow 80/tcp >/dev/null
sudo ufw allow 443/tcp >/dev/null
sudo ufw allow from "$WORKER" to any port 5432 proto tcp >/dev/null
sudo ufw --force enable >/dev/null
sudo ufw status | head -12

log "unattended security upgrades"
echo 'APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";' | sudo tee /etc/apt/apt.conf.d/20auto-upgrades >/dev/null

cat <<NEXT

[provision] DONE.
  Database URL for this host    postgresql://socbench:<password>@127.0.0.1:5432/socbench
  Database URL for the worker   postgresql://socbench:<password>@$PRIVATE_IP:5432/socbench?sslmode=require
  The password is in /etc/socbench/db-password  (sudo cat /etc/socbench/db-password)

  Next:
    1. write /etc/socbench/web.env  (owner root:socbench, mode 0640) — see .env.example
    2. sudo /opt/socbench/scripts/web-update.sh --force     # creates the tables, builds the site, starts it
    3. open https://$DOMAIN
NEXT
