{
  config,
  lib,
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
  security.pam.services.sudo_local.touchIdAuth = true;
  environment.systemPackages = [ brewZshCompletion ];

  # Install Homebrew on a fresh Mac and adopt an existing /opt/homebrew install.
  nix-homebrew = {
    enable = true;
    autoMigrate = true;
    user = "kostyafarber";
  };

  # Homebrew refuses to load formulae from third-party taps until they are
  # trusted (~/.homebrew/trust.json, per machine), which made `brew bundle`
  # fail on every fresh Mac. Trust each declared tap after nix-homebrew sets
  # up the prefix (mkBefore) and before nix-darwin's bundle (default order).
  system.activationScripts.homebrew.text = lib.mkIf (config.homebrew.enable && config.homebrew.taps != [ ]) (
    lib.mkOrder 750 ''
      echo >&2 "trusting Homebrew taps..."
      sudo --user=${lib.escapeShellArg config.system.primaryUser} --set-home \
        ${config.homebrew.brewPrefix}/brew trust --quiet --tap \
        ${lib.escapeShellArgs (map (t: t.name) config.homebrew.taps)}
    ''
  );

  home-manager = {
    useGlobalPkgs = true;
    useUserPackages = true;
    backupFileExtension = "backup";
    extraSpecialArgs = { inherit inputs; };
    users.kostyafarber.imports = [ ../home/common.nix ];
  };
}
