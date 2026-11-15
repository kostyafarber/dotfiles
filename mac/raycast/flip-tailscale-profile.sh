#!/usr/bin/env bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Flip Tailscale Profile
# @raycast.mode silent

# Optional parameters:
# @raycast.icon images/tailscale.png
# @raycast.packageName Tailscale
# @raycast.description Switch to the other logged-in Tailscale profile.

set -uo pipefail

export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
hud_source="$script_dir/helpers/tailscale-hud.swift"
hud_bin="${XDG_CACHE_HOME:-$HOME/.cache}/tailscale-hud/tailscale-hud"

# Compiled on first use, and again when the source changes.
build_hud() {
  [[ -x "$hud_bin" && ! "$hud_source" -nt "$hud_bin" ]] && return 0
  mkdir -p "$(dirname "$hud_bin")" && swiftc -O "$hud_source" -o "$hud_bin" >/dev/null 2>&1
}

hud_on=""
if build_hud; then
  # The pill fades out once this script exits and closes fd 3.
  exec 3> >("$hud_bin" "$script_dir/images/tailscale.png" >/dev/null 2>&1)
  hud_on=1
fi

status() {
  [[ -n "$hud_on" ]] && printf '%s\t%s\n' "$1" "$2" >&3
}

# Without the pill, Raycast shows the last line of stdout instead.
finish() {
  status "$1" "$2"
  [[ -z "$hud_on" ]] && echo "$2"
  [[ -z "$hud_on" && "$1" == "failure" ]] && exit 1
  exit 0
}

backend_state() {
  tailscale status --json 2>/dev/null |
    sed -n 's/.*"BackendState": *"\([^"]*\)".*/\1/p' |
    head -1
}

list="$(tailscale switch --list 2>/dev/null)" || finish failure "Tailscale isn't running"

# The active profile's row ends in "*".
others="$(printf '%s\n' "$list" | awk 'NR > 1 && $NF !~ /\*$/ { print $1, $2 }')"

if [[ "$(printf '%s\n' "$others" | grep -c .)" -ne 1 ]]; then
  finish failure "Needs exactly two profiles"
fi

read -r id tailnet <<<"$others"
current="$(printf '%s\n' "$list" | awk 'NR > 1 && $NF ~ /\*$/ { print $2 }')"

# Personal tailnets are named after the account's email address.
display_name() {
  case "$1" in
    *@*) echo "Personal" ;;
    *) echo "$1" ;;
  esac
}

name="$(display_name "$tailnet")"
flip="$(display_name "$current") → ${name}"

status loading "$flip"

tailscale switch "$id" >/dev/null 2>&1 || finish failure "Couldn't switch to $name"

state=""
for _ in 1 2 3 4 5 6 7 8 9 10; do
  state="$(backend_state)"
  [[ "$state" == "Running" || "$state" == "NeedsLogin" ]] && break
  sleep 0.3
done

case "$state" in
  Running) finish success "$flip" ;;
  NeedsLogin) finish failure "$name needs you to log in again" ;;
  Stopped) finish warning "$name is disconnected" ;;
  *) finish warning "Still connecting to $name" ;;
esac
