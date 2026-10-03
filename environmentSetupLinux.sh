#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

COMMUNITY_DRAGON_BASE_URL='https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1'

download_source() {
    local source_name="$1"
    local output_name="$2"

    curl --fail --silent --show-error --location \
        "$COMMUNITY_DRAGON_BASE_URL/$source_name" \
        --output "data/source/$output_name"
}

mkdir -p data/source
download_source 'nexusfinishers.json' 'finishers.json'
download_source 'summoner-emotes.json' 'emotes.json'


# Skins
download_source 'skins.json' 'skins.json'
download_source 'skinlines.json' 'skinlines.json'
download_source 'champion-summary.json' 'champion-summary.json'
download_source 'universes.json' 'universes.json'

# Icons
download_source 'summoner-icons.json' 'icons.json'

# Wards
download_source 'ward-skins.json' 'wards.json'

node processStaticDataLinux.ts
