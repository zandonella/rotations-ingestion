#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="backups"
TIMESTAMP="$(date +%Y-%m-%d-%H%M%S)"
DUMP_FILE="$BACKUP_DIR/prod-data-pull-$TIMESTAMP.sql"
LOCAL_DB_URL="postgresql://postgres:postgres@localhost:54322/postgres"

mkdir -p "$BACKUP_DIR"

echo "Dumping live Supabase data (public, auth)..."
npx supabase db dump --linked \
  --schema public,auth \
  --data-only \
  --file "$DUMP_FILE"

echo "Resetting local database..."
npx supabase db reset

echo "Restoring live data into local database..."
psql "$LOCAL_DB_URL" -f "$DUMP_FILE"

echo "Done. Local database now mirrors live data from $DUMP_FILE"
