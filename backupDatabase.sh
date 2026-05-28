#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="backups"
TIMESTAMP="$(date +%Y-%m-%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"

echo "Creating Supabase database backups..."

# Schema / structure backup
npx supabase db dump --linked \
  --schema public,auth,storage \
  --file "$BACKUP_DIR/prod-schema-$TIMESTAMP.sql"

# Row data backup
npx supabase db dump --linked \
  --schema public,auth,storage \
  --data-only \
  --file "$BACKUP_DIR/prod-data-$TIMESTAMP.sql"

echo "Backups created:"
ls -lh "$BACKUP_DIR"/*"$TIMESTAMP"*.sql