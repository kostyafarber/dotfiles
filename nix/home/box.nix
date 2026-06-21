{ ... }:

# Ubuntu home server ("box"). Only the things that differ from common.nix.
{
  home.username = "firmclaw";
  home.homeDirectory = "/home/firmclaw";

  # which flake output `hms`/`update` apply on this host (.zshenv → every shell)
  programs.zsh.envExtra = ''export DOTFILES_HM_TARGET="firmclaw@box"'';
}
