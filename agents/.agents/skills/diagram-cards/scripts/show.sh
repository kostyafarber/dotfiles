#!/bin/sh
# Open the Rex pane that steps through the deck, or leave the one already open alone
# (it watches the deck folder, so new renders show up by themselves).
here=$(cd "$(dirname "$0")" && pwd)
deck=${1:-$HOME/.cache/diagram-cards/deck}
mkdir -p "$deck"
if rex block ls -s "$REX_SESSION" --json 2>/dev/null | grep -q '"label": *"diagrams"'; then
  echo "diagrams pane already open"; exit 0
fi
rex split -s "$REX_SESSION" -b "$REX_BLOCK" --split=below --ratio 60 --focus=false \
  --label diagrams --json -- python3 "$here/deck.py" "$deck" | jq -r '.block_ids[0]'
