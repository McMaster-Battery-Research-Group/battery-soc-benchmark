#!/usr/bin/env bash
# Battery SOC Benchmark — base provisioning for an evaluation worker on an Alliance Cloud (Arbutus) Ubuntu 24.04 VM.
# Usage (on the VM, as the default sudo user):  scp scripts/provision-arbutus-worker.sh ubuntu@<ip>: && ssh ubuntu@<ip> ./provision-arbutus-worker.sh
# Idempotent: safe to re-run. Does NOT copy secrets or the blinded dataset — see docs/drac-migration.md ("Runbook").
# Needs a read-only GitHub deploy key for the socbench user (the repo is private): see the runbook.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
log() { echo "[provision $(date -u +%H:%M:%S)] $*"; }

log "sudo check"; sudo -n true

log "apt: base packages"
sudo apt-get update -qq
sudo apt-get install -y -qq ca-certificates curl gnupg git ufw unattended-upgrades apt-listchanges >/dev/null

log "docker: official repository"
if ! command -v docker >/dev/null; then
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update -qq
  sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io >/dev/null
fi
sudo systemctl enable --now docker >/dev/null
docker --version

log "node: 22.x from NodeSource"
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1)" != "v22" ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - >/dev/null
  sudo apt-get install -y -qq nodejs >/dev/null
fi
node -v; npm -v

log "service user socbench (no login shell, member of docker group so it can start sandboxes)"
id socbench >/dev/null 2>&1 || sudo useradd --system --create-home --home-dir /var/lib/socbench --shell /usr/sbin/nologin socbench
sudo usermod -aG docker socbench
sudo install -d -m 0750 -o socbench -g socbench /etc/socbench /var/lib/socbench/blind-data

log "repository -> /opt/socbench"
if [ ! -d /opt/socbench/.git ]; then
  sudo install -d -m 0755 -o socbench -g socbench /opt/socbench
  sudo -u socbench git clone -q git@github.com:AhmadAli137/battery-soc-benchmark.git /opt/socbench
else
  sudo -u socbench git -C /opt/socbench pull -q --ff-only
fi
sudo -u socbench bash -c 'cd /opt/socbench && npm ci --no-audit --no-fund --loglevel=error && npx prisma generate >/dev/null'
sudo -u socbench git -C /opt/socbench log --format='%h %s' -1

log "sandbox image socbench-eval"
sudo docker build -q -t socbench-eval /opt/socbench/evaluator >/dev/null
sudo docker image ls socbench-eval --format '{{.Repository}}:{{.Tag}} {{.Size}}'

log "systemd unit (not started until /etc/socbench/worker.env exists)"
sudo tee /etc/systemd/system/socbench-worker.service >/dev/null <<'UNIT'
[Unit]
Description=Battery SOC Benchmark evaluation worker
After=network-online.target docker.service
Wants=network-online.target
Requires=docker.service
ConditionPathExists=/etc/socbench/worker.env

[Service]
Type=simple
User=socbench
Group=socbench
WorkingDirectory=/opt/socbench
ExecStart=/usr/bin/node --env-file=/etc/socbench/worker.env --import tsx src/evaluator/worker.ts
Restart=always
RestartSec=10
KillSignal=SIGINT
TimeoutStopSec=90
Environment=NODE_ENV=production
NoNewPrivileges=true
PrivateTmp=false
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/var/lib/socbench /tmp
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable socbench-worker >/dev/null 2>&1 || true

log "firewall: deny incoming except SSH (the OpenStack security group already restricts sources)"
sudo ufw --force default deny incoming >/dev/null
sudo ufw --force default allow outgoing >/dev/null
sudo ufw allow 22/tcp >/dev/null
sudo ufw --force enable >/dev/null
sudo ufw status | head -5

log "unattended security upgrades"
echo 'APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";' | sudo tee /etc/apt/apt.conf.d/20auto-upgrades >/dev/null

log "DONE — next: copy worker.env + blind_data.mat, then: sudo systemctl start socbench-worker"
