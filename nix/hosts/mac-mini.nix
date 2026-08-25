{
  imports = [
    ../profiles/workstation.nix
    ../profiles/always-on.nix
    ../profiles/syncthing.nix
  ];

  networking.hostName = "mac-mini";

  home-manager.users.kostyafarber.programs.zsh.envExtra = ''
    export DOTFILES_TARGET="mac-mini"
  '';
}
