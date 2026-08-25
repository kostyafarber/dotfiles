{
  config,
  inputs,
  pkgs,
  ...
}:

let
  # nix-homebrew stores its own completion outside the conventional Zsh path.
  # Expose it through the Nix system profile instead of mutating /opt/homebrew.
  brewZshCompletion = pkgs.runCommand "brew-zsh-completion" { } ''
    mkdir -p "$out/share/zsh/site-functions"
    ln -s ${config.nix-homebrew.package}/completions/zsh/_brew \
      "$out/share/zsh/site-functions/_brew"
  '';
in
{
  # Determinate Nix owns the daemon and /etc/nix configuration.
  nix.enable = false;

  system = {
    primaryUser = "kostyafarber";
    stateVersion = 6;
  };

  users.users.kostyafarber = {
    home = "/Users/kostyafarber";
    shell = pkgs.zsh;
  };

  programs.zsh.enable = true;
  environment.systemPackages = [ brewZshCompletion ];

  # Install Homebrew on a fresh Mac and adopt an existing /opt/homebrew install.
  nix-homebrew = {
    enable = true;
    autoMigrate = true;
    user = "kostyafarber";
  };

  home-manager = {
    useGlobalPkgs = true;
    useUserPackages = true;
    backupFileExtension = "backup";
    extraSpecialArgs = { inherit inputs; };
    users.kostyafarber.imports = [ ../home/common.nix ];
  };
}
