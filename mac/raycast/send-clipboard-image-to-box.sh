#!/usr/bin/env bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Send Clipboard Image to Box
# @raycast.mode silent

# Optional parameters:
# @raycast.icon 🖼️
# @raycast.packageName Box
# @raycast.description Upload the clipboard image to the box and copy its remote path.

set -euo pipefail

export PATH="${HOME}/.nix-profile/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

if ! command -v pngpaste >/dev/null 2>&1; then
  echo "pngpaste is not installed; run your Home Manager switch first." >&2
  exit 1
fi

image_id="$(uuidgen | tr '[:upper:]' '[:lower:]')"
image_name="clipboard-${image_id}.png"
local_dir="$(mktemp -d /tmp/clipboard-image.XXXXXX)"
local_path="${local_dir}/${image_name}"
remote_dir="/tmp/clipboard-images"
remote_path="${remote_dir}/${image_name}"

cleanup() {
  rm -rf "$local_dir"
}
trap cleanup EXIT

pngpaste "$local_path"
ssh \
  -q \
  -o BatchMode=yes \
  -o ClearAllForwardings=yes \
  -o ConnectTimeout=10 \
  clawsh \
  "install -d -m 700 '${remote_dir}'"
scp \
  -q \
  -o BatchMode=yes \
  -o ClearAllForwardings=yes \
  -o ConnectTimeout=10 \
  "$local_path" \
  "clawsh:${remote_path}"
printf '%s' "$remote_path" | pbcopy
