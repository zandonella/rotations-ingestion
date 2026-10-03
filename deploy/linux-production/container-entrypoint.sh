#!/usr/bin/env bash
set -euo pipefail
: "${EXIT_NODE:?Set EXIT_NODE in private .env.proxy.local}"
: "${ROTATIONS_LAB_ROOT:?Set the private Wine runtime root}"
# Firewall precedes every unprivileged process. No direct DNS or internet fallback.
for fw in iptables-nft ip6tables-nft; do
    "$fw" -N INGESTION_EGRESS 2>/dev/null || true
    "$fw" -F INGESTION_EGRESS
    "$fw" -A INGESTION_EGRESS -m owner --uid-owner 0 -j ACCEPT
    if [[ "$fw" == iptables-nft ]]; then
        "$fw" -A INGESTION_EGRESS -d 127.0.0.11/32 -p udp --dport 53 -j REJECT
        "$fw" -A INGESTION_EGRESS -d 127.0.0.11/32 -p tcp --dport 53 -j REJECT
    fi
    "$fw" -A INGESTION_EGRESS -o lo -j ACCEPT
    "$fw" -A INGESTION_EGRESS -o tailscale0 -j ACCEPT
    "$fw" -A INGESTION_EGRESS -j REJECT
    "$fw" -C OUTPUT -j INGESTION_EGRESS 2>/dev/null || "$fw" -I OUTPUT 1 -j INGESTION_EGRESS
done
# Explicit DNS avoids Docker/host DNS forwarding outside the tunnel.
printf 'nameserver 1.1.1.1\nnameserver 1.0.0.1\n' > /etc/resolv.conf
mkdir -p /var/run/tailscale
tailscaled --state=/var/lib/tailscale/tailscaled.state --socket=/var/run/tailscale/tailscaled.sock &
tunnel_pid=$!
riot_pid=''
cleanup() {
    [[ -z "$riot_pid" ]] || kill "$riot_pid" 2>/dev/null || true
    kill "$tunnel_pid" 2>/dev/null || true
    wait || true
}
trap cleanup EXIT
trap 'exit 143' TERM INT
for attempt in {1..30}; do
    [[ -S /var/run/tailscale/tailscaled.sock ]] && break
    sleep 1
done
[[ "$(tailscale status --json | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>console.log(JSON.parse(s).BackendState))')" == Running ]] || {
    echo 'Tailscale state is not signed in. Authorize the private state before starting production.' >&2
    exit 1
}
tailscale set --exit-node="$EXIT_NODE" --exit-node-allow-lan-access=false --accept-dns=false
setpriv --reuid=1000 --regid=1000 --init-groups --bounding-set=-all --inh-caps=-all --ambient-caps=-all --no-new-privs     bash scripts/linux-lab/run-riot-stack.sh &
riot_pid=$!
# Exiting either process restarts the entire network and client together.
wait -n "$tunnel_pid" "$riot_pid"
