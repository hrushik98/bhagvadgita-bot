#!/bin/sh
# Builds the search index on first start (downloads the embedding model into
# the mounted cache), then starts the API.
set -e
if [ ! -f /app/data/gita.db ]; then
  echo "No database found. Building the index (first run downloads a 1.2 GB model)..."
  node scripts/ingest.ts
fi
exec node src/server.ts
