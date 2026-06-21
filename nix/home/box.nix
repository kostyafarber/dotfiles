{ ... }:

# Ubuntu home server ("box"). Only the things that differ from common.nix.
{
  home.username = "firmclaw";
  home.homeDirectory = "/home/firmclaw";

  programs.zsh.shellAliases = {
    # one-shot apply of this flake on the box
    hms = "home-manager switch --flake ~/.dotfiles#firmclaw@box";
  };
}
