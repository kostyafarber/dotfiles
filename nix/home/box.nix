{ lib, pkgs, ... }:

# Ubuntu home server ("box"). Only the things that differ from common.nix.
let
  # Shared runtime libraries for native Node modules and Electron apps. Keeping
  # this in Home Manager makes ordinary commands work in every shell and agent
  # without hard-coded /nix/store paths or per-command environment prefixes.
  electronRuntimeLibraries = with pkgs; [
    alsa-lib
    at-spi2-core
    cairo
    cups
    dbus
    expat
    glib
    gtk3
    libgbm
    libx11
    libxcomposite
    libxdamage
    libxext
    libxfixes
    libxrandr
    libxcb
    libxkbcommon
    nspr
    nss
    pango
    sqlite
    systemd
  ];
in
{
  home.username = "firmclaw";
  home.homeDirectory = "/home/firmclaw";
  home.packages = [ pkgs.xorg-server ];

  home.sessionVariables = {
    DISPLAY = ":99";
    LD_LIBRARY_PATH = lib.makeLibraryPath electronRuntimeLibraries;
  };

  # Persistent display for Electron and browser tests on the headless box.
  # systemd starts it with the user session and restarts it only after failure.
  systemd.user.services.headless-display = {
    Unit.Description = "Headless X display";
    Service = {
      ExecStart = "${pkgs.xorg-server}/bin/Xvfb :99 -screen 0 1920x1080x24 -nolisten tcp";
      Restart = "on-failure";
    };
    Install.WantedBy = [ "default.target" ];
  };

  # which flake output `hms`/`update` apply on this host (.zshenv → every shell)
  programs.zsh.envExtra = ''export DOTFILES_HM_TARGET="firmclaw@box"'';
}
