#!/usr/bin/env bash
# Pack the built package, install it the way users do, and boot the demo.
# Prints only the tarball name on stdout so a release can publish exactly what was tested.
set -euo pipefail

package="$(npm pack --silent | tail -n 1)"
temp="$(mktemp -d)"
trap 'kill "${demo_pid:-}" 2>/dev/null || true; rm -rf "$temp"' EXIT

npm install --prefix "$temp" --ignore-scripts --no-audit --no-fund "./$package" >&2
"$temp/node_modules/.bin/git-history-ui" --no-open --port 3210 --host 127.0.0.1 demo >"$temp/demo.log" 2>&1 &
demo_pid=$!

for _ in {1..30}; do
  if curl --fail --silent http://127.0.0.1:3210/api/health >/dev/null; then
    echo "$package"
    exit 0
  fi
  sleep 1
done
cat "$temp/demo.log" >&2
exit 1
