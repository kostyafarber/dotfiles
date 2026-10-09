{
  config,
  lib,
  pkgs,
  ...
}:

# Ubuntu Beelink home server. Only the things that differ from common.nix.
let
  dotfiles = "${config.home.homeDirectory}/.dotfiles";

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
  imports = [ ./syncthing.nix ];

  home.username = "kostyafarber";
  home.homeDirectory = "/home/kostyafarber";
  # wl-clipboard gives Neovim and the shell the desktop clipboard under Wayland.
  home.packages = [
    pkgs.xorg-server
    pkgs.wl-clipboard
  ];

  # Headless shells (SSH, agents) draw on the Xvfb display below and load Nix
  # runtime libraries for Electron. GNOME runs this file through a login shell
  # before its display exists, so graphical sessions are recognised by
  # XDG_SESSION_TYPE; leaking either variable into them breaks the desktop.
  programs.zsh.envExtra = lib.mkMerge [
    ''
      case "$XDG_SESSION_TYPE" in
        wayland|x11) ;;
        *)
          if [ -z "$DISPLAY" ] && [ -z "$WAYLAND_DISPLAY" ]; then
            export DISPLAY=:99
            export LD_LIBRARY_PATH="${lib.makeLibraryPath electronRuntimeLibraries}''${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
          fi
          ;;
      esac
    ''
    # Which flake output `rebuild`/`update` apply on this host.
    ''export DOTFILES_TARGET="kostyafarber@beelink"''
  ];

  # Ghostty comes from the snap (it needs the system's GPU drivers); only its
  # config is managed here, shared with the Macs.
  xdg.configFile."ghostty/config".source =
    config.lib.file.mkOutOfStoreSymlink "${dotfiles}/ghostty/.config/ghostty/config";
  xdg.configFile."ghostty/themes".source =
    config.lib.file.mkOutOfStoreSymlink "${dotfiles}/ghostty/.config/ghostty/themes";

  # GNOME raises its screen shield when a Desktop Sharing session ends, and
  # refuses new remote sessions while it is up ("Session creation inhibited").
  # This box is reached only by remote desktop, so drop the shield at once.
  systemd.user.services.screen-shield-guard = {
    Unit = {
      Description = "Keep GNOME's screen shield down for Desktop Sharing";
      After = [ "graphical-session.target" ];
      PartOf = [ "graphical-session.target" ];
    };
    Service = {
      ExecStart = "${pkgs.writeShellScript "screen-shield-guard" ''
        lower() {
          ${pkgs.glib}/bin/gdbus call --session --dest org.gnome.ScreenSaver \
            --object-path /org/gnome/ScreenSaver --method org.gnome.ScreenSaver.SetActive false >/dev/null
        }
        lower
        ${pkgs.glib}/bin/gdbus monitor --session --dest org.gnome.ScreenSaver --object-path /org/gnome/ScreenSaver |
          while read -r line; do
            case "$line" in *ActiveChanged*true*) lower ;; esac
          done
      ''}";
      Restart = "always";
      RestartSec = 5;
    };
    Install.WantedBy = [ "graphical-session.target" ];
  };

  # Persistent display for Electron and browser tests on the headless server.
  # systemd starts it with the user session and restarts it only after failure.
  systemd.user.services.headless-display = {
    Unit.Description = "Headless X display";
    Service = {
      ExecStart = "${pkgs.xorg-server}/bin/Xvfb :99 -screen 0 1920x1080x24 -nolisten tcp";
      Restart = "on-failure";
    };
    Install.WantedBy = [ "default.target" ];
  };
}
