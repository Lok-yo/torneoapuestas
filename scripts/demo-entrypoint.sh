#!/bin/sh
set -eu

manifest="${DEMO_STATE_DIR:-/demo-state}/${DEMO_MANIFEST:?DEMO_MANIFEST is required}"
attempt=0
while [ ! -s "$manifest" ]; do
  attempt=$((attempt + 1))
  if [ "$attempt" -gt 60 ]; then
    echo "demo-entrypoint: deployment manifest not ready after 60 seconds" >&2
    exit 1
  fi
  sleep 1
done

set -a
. "$manifest"
set +a
exec "$@"
