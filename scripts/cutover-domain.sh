#!/usr/bin/env bash
# Battery SOC Benchmark — move the Arbutus web host to another public host name (staging name → main domain).
# Change the DNS records FIRST and wait until they resolve to this host: the certificate is issued over HTTP on that name.
#   sudo /opt/socbench/scripts/cutover-domain.sh batterysocbenchmark.ca www.batterysocbenchmark.ca stg.batterysocbenchmark.ca
# The first name is the site; every further name redirects to it. Rewrites /etc/caddy/Caddyfile, sets AUTH_URL and
# NEXT_PUBLIC_SITE_URL in /etc/socbench/web.env, rebuilds (the public URL is fixed at build time) and restarts.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "run with sudo"; exit 1; }
[ $# -ge 1 ] || { echo "usage: $0 <domain> [redirected names…]"; exit 1; }
DOMAIN=$1; shift
ME=$(curl -4 -s --max-time 10 https://api.ipify.org || true)
for h in "$DOMAIN" "$@"; do
  got=$(getent ahostsv4 "$h" | awk '{print $1}' | head -1)
  [ "$got" = "$ME" ] || { echo "$h resolves to ${got:-nothing}, not to this host ($ME) — fix DNS first"; exit 1; }
done
{
  printf '%s {\n\tencode zstd gzip\n\trequest_body {\n\t\tmax_size 60MB\n\t}\n\treverse_proxy 127.0.0.1:3000\n}\n' "$DOMAIN"
  for h in "$@"; do printf '\n%s {\n\tredir https://%s{uri} permanent\n}\n' "$h" "$DOMAIN"; done
} >/etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
systemctl reload caddy
sed -i -E "s#^(AUTH_URL|NEXT_PUBLIC_SITE_URL)=.*#\1=\"https://$DOMAIN\"#" /etc/socbench/web.env
/opt/socbench/scripts/web-update.sh --force
sleep 5
curl -s -o /dev/null -w "https://$DOMAIN → %{http_code}\n" --max-time 20 "https://$DOMAIN/"
echo "Remember: the worker's STORAGE_REMOTE_URL and NEXT_PUBLIC_SITE_URL must name https://$DOMAIN too (cutover-worker-settings.sh prints them)."
