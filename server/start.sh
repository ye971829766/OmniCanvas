#!/usr/bin/env bash
# Panel-friendly launcher: finds bun even when PATH is minimal (宝塔/PM2/面板)
set -e
cd "$(dirname "$0")"

find_bun() {
  if command -v bun >/dev/null 2>&1; then command -v bun; return; fi
  for p in \
    "$HOME/.bun/bin/bun" \
    /root/.bun/bin/bun \
    /usr/local/bin/bun \
    /usr/bin/bun
  do
    if [ -x "$p" ]; then echo "$p"; return; fi
  done
  return 1
}

BUN_BIN="$(find_bun || true)"
if [ -z "$BUN_BIN" ]; then
  echo "ERROR: bun not found."
  echo "Install: curl -fsSL https://bun.sh/install | bash"
  echo "Or set absolute path in panel start command."
  exit 127
fi

export PATH="$(dirname "$BUN_BIN"):$PATH"
exec "$BUN_BIN" --use-system-ca run src/main.ts
