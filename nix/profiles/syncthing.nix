{ ... }:

{
  home-manager.users.kostyafarber.imports = [ ../home/syncthing.nix ];

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
