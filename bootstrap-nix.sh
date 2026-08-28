#!/usr/bin/env bash
# Bootstrap a machine onto these dotfiles. Safe to re-run.
#
#   ./bootstrap-nix.sh mac-mini
#   ./bootstrap-nix.sh macbook
#   ./bootstrap-nix.sh kostyafarber@beelink
set -euo pipefail

TARGET="${1:-}"
REPO="https://github.com/kostyafarber/dotfiles.git"
DOTDIR="$HOME/.dotfiles"
DARWIN_REF="github:nix-darwin/nix-darwin/nix-darwin-25.11#darwin-rebuild"
HM_REF="github:nix-community/home-manager/release-25.11"

if [ -z "$TARGET" ]; then
  echo "usage: $0 <mac-mini|macbook|kostyafarber@beelink>" >&2
  exit 1
fi

# 1. Nix (Determinate installer — enables flakes out of the box)
if ! command -v nix >/dev/null 2>&1; then
  echo "==> installing Nix..."
  curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install
fi
command -v nix >/dev/null 2>&1 || . /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh

# 2. Dotfiles repo
if [ ! -d "$DOTDIR/.git" ]; then
  echo "==> cloning dotfiles to $DOTDIR..."
  git clone "$REPO" "$DOTDIR"
fi

# 3. Git filter: strip the "model" key Claude Code writes into settings.json
# jq is supplied by the activated Home Manager configuration.
git -C "$DOTDIR" config filter.claude-settings.clean "jq 'del(.model)'"

# 4. Activate the platform-appropriate output.
if [ "$(uname -s)" = "Darwin" ]; then
  case "$TARGET" in
    macbook|mac-mini) ;;
    *)
      echo "Darwin target must be macbook or mac-mini" >&2
      exit 1
      ;;
  esac

  echo "==> nix-darwin switch -> $TARGET"
  sudo "$(command -v nix)" run "$DARWIN_REF" -- switch --flake "$DOTDIR#$TARGET"
else
  echo "==> home-manager switch -> $TARGET"
  nix run "$HM_REF" -- switch -b backup --flake "$DOTDIR#$TARGET"
fi

printf '\nDone. Open a new shell, or run: exec zsh\n'
