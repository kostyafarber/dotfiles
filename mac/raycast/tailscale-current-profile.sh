#!/usr/bin/env bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Current Tailscale Profile
# @raycast.mode inline
# @raycast.refreshTime 10s

# Optional parameters:
# @raycast.icon images/tailscale.png
# @raycast.packageName Tailscale
# @raycast.description Show the active Tailscale profile in the Raycast list.

export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

# Always exits 0, because Raycast shows a failure toast for each failed refresh.
current="$(tailscale switch --list 2>/dev/null | awk 'NR > 1 && $NF ~ /\*$/ { print $2 }')"

case "$current" in
  "") echo "Unavailable" ;;
  *@*) echo "Personal" ;;
  *) echo "$current" ;;
esac
