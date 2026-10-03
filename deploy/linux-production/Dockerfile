FROM tailscale/tailscale@sha256:c507f3a2a6ab1cabd8d809b98edeb41edbd5c3fb6ad9632ffd098b4c7d0b4065 AS tailscale
FROM node:24-bookworm-slim AS node
FROM ubuntu:24.04
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ca-certificates curl xvfb procps util-linux iptables fonts-liberation libstdc++6 libgnutls30t64 libx11-6 libxext6 libfreetype6 libfontconfig1 libxrender1 libxrandr2 libxi6 libxcursor1 libxfixes3 libxinerama1 libgl1 libasound2t64 libpulse0 libdbus-1-3 libnss3 libgstreamer1.0-0 libvulkan1 && rm -rf /var/lib/apt/lists/*
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=tailscale /usr/local/bin/tailscale /usr/local/bin/tailscaled /usr/local/bin/
RUN userdel ubuntu && useradd -m -u 1000 zando
COPY deploy/linux-production/container-entrypoint.sh /usr/local/bin/ingestion-start
ENTRYPOINT ["/usr/bin/bash", "/usr/local/bin/ingestion-start"]
