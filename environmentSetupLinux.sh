#!/bin/bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
COMMUNITY_DRAGON_BASE_URL='https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1'
mkdir -p data/source
staging="$(mktemp -d data/source/.communitydragon-XXXXXX)"
trap 'rm -rf "$staging"' EXIT
SECONDS=0

download_source() {
    local source_name="$1" output_name="$2" remaining result
    remaining=$((60 - SECONDS))
    if (( remaining <= 0 )); then
        echo 'CommunityDragon download budget exhausted.' >&2
        exit 76
    fi
    if curl --fail --silent --show-error --location --connect-timeout 10 --max-time "$remaining" \
        "$COMMUNITY_DRAGON_BASE_URL/$source_name" --output "$staging/$output_name"; then
        return
    else
        result=$?
        case "$result" in
            5|6|7|16|18|22|28|35|52|55|56|60|92|95|96) exit 76 ;;
            *) exit "$result" ;;
        esac
    fi
}

download_source 'nexusfinishers.json' 'finishers.json'
download_source 'summoner-emotes.json' 'emotes.json'
download_source 'skins.json' 'skins.json'
download_source 'skinlines.json' 'skinlines.json'
download_source 'champion-summary.json' 'champion-summary.json'
download_source 'universes.json' 'universes.json'
download_source 'summoner-icons.json' 'icons.json'
download_source 'ward-skins.json' 'wards.json'
# Validate every response before replacing any cached file.
node --input-type=module - "$staging" <<'JS'
import fs from 'node:fs';
import path from 'node:path';
for (const name of fs.readdirSync(process.argv[2])) {
    const body = fs.readFileSync(path.join(process.argv[2], name), 'utf8');
    try {
        const data = JSON.parse(body);
        if (!data || typeof data !== 'object') throw new Error('Expected JSON object or array');
    } catch (error) {
        console.warn(`CommunityDragon returned invalid JSON for ${name}: ${error.message}`);
        process.exit(76);
    }
}
JS
for source_file in "$staging"/*.json; do
    mv "$source_file" "data/source/$(basename "$source_file")"
done
node processStaticDataLinux.ts
