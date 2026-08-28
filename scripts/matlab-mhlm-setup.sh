#!/usr/bin/env bash
# One-time MATLAB online-licensing setup for an evaluation host (run ON the VM, as the sudo user).
# See docs/drac-migration.md → "MATLAB on the VM".
#
# Prerequisite: a container named socbench-matlab-login in which the licence holder has signed in through the
# browser UI (`--entrypoint /bin/run.sh ... -browser`, port-forwarded, http://localhost:8888). That sign-in leaves a
# one-year *identity token* in the container's matlab-proxy config. This script:
#   1. copies just the fields the worker needs into /etc/socbench/matlab-mhlm.json (mode 600, owner socbench)
#   2. verifies the token exchange against login.mathworks.com
#   3. verifies `matlab -batch` licenses inside the sandbox image using ONLY the short-lived access token
#   4. removes the login container and any extracted copies of the token
# The identity token never goes into an image; the worker exchanges it per evaluation (src/evaluator/python-evaluator.ts).
set -euo pipefail
IMAGE=${IMAGE:-socbench-eval-matlab:latest}
OUT=/etc/socbench/matlab-mhlm.json
log() { echo "[mhlm-setup] $*"; }

sudo docker inspect socbench-matlab-login >/dev/null 2>&1 || { echo "container socbench-matlab-login not found — do the browser login first (runbook)"; exit 1; }

log "1/4 extracting identity token → $OUT"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
sudo docker cp socbench-matlab-login:/home/matlab/.matlab/MWI "$TMP/MWI"
CFG=$(find "$TMP/MWI/hosts" -name proxy_app_config.json | head -1)
[ -n "$CFG" ] || { echo "no proxy_app_config.json in the container — was the sign-in completed?"; exit 1; }
sudo python3 - "$CFG" "$OUT" <<'PY'
import json, sys, os
c = json.load(open(sys.argv[1]))["licensing"]
if c.get("type") != "mhlm": raise SystemExit(f"licensing type is {c.get('type')!r}, expected mhlm (online licensing)")
out = {"identity_token": c["identity_token"], "source_id": c["source_id"], "entitlement_id": c["entitlement_id"],
       "email": c.get("email_addr"), "expiry": c.get("expiry"), "license_number": (c.get("entitlements") or [{}])[0].get("license_number")}
fd = os.open(sys.argv[2], os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, "w") as f: json.dump(out, f, indent=1)
print(f"  account {out['email']} · entitlement {out['entitlement_id']} · licence {out['license_number']} · identity token expires {out['expiry']}")
PY
sudo chown socbench:socbench "$OUT" && sudo chmod 600 "$OUT"

log "2/4 token exchange (identity → 24 h access token)"
TOK=$(sudo python3 - "$OUT" <<'PY'
import json, sys, urllib.request, urllib.parse
c = json.load(open(sys.argv[1]))
data = urllib.parse.urlencode({"tokenString": c["identity_token"], "type": "MWAS", "sourceId": c["source_id"]}).encode()
req = urllib.request.Request("https://login.mathworks.com/authenticationws/service/v4/tokens/access", data=data,
    headers={"content-type": "application/x-www-form-urlencoded", "accept": "application/json", "X_MW_WS_callerId": "desktop-jupyter"})
print(json.load(urllib.request.urlopen(req, timeout=30))["accessTokenString"])
PY
)
ENT=$(sudo python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['entitlement_id'])" "$OUT")
log "  ok (access token ${#TOK} chars)"

log "3/4 matlab -batch inside $IMAGE with the access token only (no token in the image)"
timeout 600 sudo docker run --rm --user "$(id -u socbench):$(id -g socbench)" \
  -e MLM_WEB_LICENSE=true -e MLM_WEB_USER_CRED="$TOK" -e MLM_WEB_ID="$ENT" -e MHLM_CONTEXT=MATLAB_JAVASCRIPT_DESKTOP \
  --entrypoint matlab "$IMAGE" -batch 'disp(version); fprintf("Deep Learning: %d  Signal: %d  Statistics: %d\n", license("test","Neural_Network_Toolbox"), license("test","Signal_Toolbox"), license("test","Statistics_Toolbox"))' 2>&1 | tail -4
unset TOK

log "4/4 cleanup: login container, any extracted token copies, unused licensed image"
sudo docker rm -f socbench-matlab-login >/dev/null 2>&1 || true
sudo rm -rf /var/lib/socbench/matlab-license
sudo docker rmi socbench-eval-matlab:licensed >/dev/null 2>&1 || true
log "done — now set in /etc/socbench/worker.env: EVAL_SANDBOX_MATLAB_IMAGE=\"$IMAGE\" EVAL_MATLAB_MHLM_FILE=\"$OUT\" EVAL_MATLAB_NETWORK=\"bridge\" WORKER_RUNTIMES=\"python,matlab\" and restart socbench-worker"
