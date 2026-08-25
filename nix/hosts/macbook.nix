{
  imports = [
    ../profiles/workstation.nix
    ../profiles/syncthing.nix
  ];

  networking.hostName = "macbook";

  home-manager.users.kostyafarber.programs.zsh.envExtra = ''
    export DOTFILES_TARGET="macbook"
  '';
}
