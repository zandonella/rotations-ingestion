#!/usr/bin/env bash
# Wait for Docker, the exit-node tunnel, and the signed-in Riot API at boot.
set -euo pipefail
for ((attempt = 0; attempt < 36; attempt++)); do
    # Refresh group membership even when the user manager predates the grant.
    health=$(sg docker -c 'docker inspect --format "{{.State.Health.Status}}" rotations-ingestion-production' 2>/dev/null) || health=unavailable
    if [[ "$health" == healthy ]]; then
        echo 'Production Riot runtime is healthy; starting collection.'
        exit 0
    fi
    if (( attempt % 6 == 0 )); then
        echo "Waiting for production Riot runtime (health: $health)."
    fi
    sleep 5
done
echo 'Production Riot runtime did not become healthy within 3 minutes.' >&2
exit 1
