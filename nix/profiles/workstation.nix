{ config, ... }:

{
  # User-level macOS configuration shared by workstation Macs.
  home-manager.users.kostyafarber.imports = [ ../home/mac.nix ];

  # Homebrew is reserved for GUI applications that are not practical to manage
  # through nixpkgs. Cleanup stays disabled: removing a declaration never
  # uninstalls an application implicitly.
  homebrew = {
    enable = true;
    casks = [
      "1password"
      "1password-cli"
      "discord"
      "docker-desktop"
      "font-fira-code-nerd-font"
      "ghostty"
      "google-chrome"
      "markedit"
      "raycast"
      "rectangle"
      "signal"
      "spotify"
      "tailscale-app"
      "vlc"
      "whatsapp"
    ];
    onActivation = {
      autoUpdate = true;
      upgrade = false;
      cleanup = "none";
    };
  };

  system.defaults = {
    dock = {
      persistent-apps = [ ];
      static-only = true;
      show-recents = false;
      autohide = true;
    };

    LaunchServices.LSQuarantine = false;

    screencapture = {
      location = "${config.system.primaryUserHome}/Desktop";
      type = "png";
    };

    NSGlobalDomain = {
      AppleFontSmoothing = 2;
      AppleShowAllExtensions = true;
    };

    finder = {
      ShowStatusBar = true;
      ShowPathbar = true;
      _FXShowPosixPathInTitle = true;
      _FXSortFoldersFirst = true;
      FXDefaultSearchScope = "SCcf";
    };
  };

  # Caps Lock -> Escape, applied at login without a copied plist.
  launchd.user.agents.remapkeys.serviceConfig = {
    ProgramArguments = [
      "/usr/bin/hidutil"
      "property"
      "--set"
      ''{"UserKeyMapping":[{"HIDKeyboardModifierMappingSrc":0x700000039,"HIDKeyboardModifierMappingDst":0x700000029}]}''
    ];
    RunAtLoad = true;
  };
}
