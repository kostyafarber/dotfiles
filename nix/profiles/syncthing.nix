{ inputs, pkgs, ... }:

let
  syncthingPackage =
    inputs.nixpkgs-unstable.legacyPackages.${pkgs.stdenv.hostPlatform.system}.syncthing;
in
{
  home-manager.users.kostyafarber = {
    # The service module only adds Syncthing's man output, so expose the same
    # pinned binary to interactive shells as well.
    home.packages = [ syncthingPackage ];

    # Preserve device identities, peers, and folders. Keep the runtime argument,
    # persisted GUI setting, and CLI discovery endpoint aligned on loopback.
    services.syncthing = {
      enable = true;
      package = syncthingPackage;
      guiAddress = "127.0.0.1:8384";
      settings.gui.address = "127.0.0.1:8384";
      overrideDevices = false;
      overrideFolders = false;
    };
  };

  # One-time migration guard: prevent the old Homebrew launch agent and Home
  # Manager's launch agent from competing for the same Syncthing config/ports.
  system.activationScripts.preActivation.text = ''
    legacyAgent="/Users/kostyafarber/Library/LaunchAgents/homebrew.mxcl.syncthing.plist"
    if [ -e "$legacyAgent" ] && [ -x /opt/homebrew/bin/brew ]; then
      HOME=/Users/kostyafarber /usr/bin/sudo -u kostyafarber \
        /opt/homebrew/bin/brew services stop syncthing || true
    fi
  '';
}
