#!/usr/bin/env bash
# Bootstrap a machine onto these dotfiles via Nix home-manager.
#
#   ./bootstrap-nix.sh <user@host>
#
# where <user@host> is a key under `homeConfigurations` in flake.nix
# (e.g. kostyafarber@mac, firmclaw@box). Safe to re-run.
set -euo pipefail

TARGET="${1:-}"
REPO="https://github.com/kostyafarber/dotfiles.git"
DOTDIR="$HOME/.dotfiles"
HM_REF="github:nix-community/home-manager/release-25.11"

if [ -z "$TARGET" ]; then
  echo "usage: $0 <user@host>   (a homeConfigurations key, e.g. kostyafarber@mac)" >&2
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

# 3. Activate
echo "==> home-manager switch -> $TARGET"
nix run "$HM_REF" -- switch -b backup --flake "$DOTDIR#$TARGET"

cat <<EOF

Done. (Optional) make zsh your login shell:
  echo "\$HOME/.nix-profile/bin/zsh" | sudo tee -a /etc/shells
  chsh -s "\$HOME/.nix-profile/bin/zsh"

If 'switch' complained a file "would be clobbered" (a pre-existing symlink that
-b backup won't move), move it aside and re-run:
  mv <path> <path>.prenix
  nix run $HM_REF -- switch -b backup --flake $DOTDIR#$TARGET
EOF
