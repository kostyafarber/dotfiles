{
  config,
  inputs,
  lib,
  osConfig ? null,
  pkgs,
  ...
}:

let
  hostName = if osConfig != null then osConfig.networking.hostName else "beelink";

  deviceIds = {
    macbook = "J4MBVVZ-PTSECXC-6W7SRJ2-V635K7E-J5DJ2CT-WSHRPPL-6KJPSJG-2FZD3AW";
    mac-mini = "XNQF74L-KSAXORI-2CMRUBS-7J2X5C2-Y4EYTGY-GD4SBQX-XR6MI4M-63NDAQ6";
    beelink = "IYB5SR3-WFVMKA6-QI7XN4W-HM64UCY-XBLNY2S-667XYWL-7OJDFOE-C6U3IA3";
  };

  tailscaleIps = {
    macbook = "100.90.218.98";
    mac-mini = "100.94.45.68";
    beelink = "100.109.202.73";
  };

  peerNames = builtins.filter (name: name != hostName) (builtins.attrNames deviceIds);
  peerDevices = lib.genAttrs peerNames (name: {
    id = deviceIds.${name};
    addresses = [ "tcp://${tailscaleIps.${name}}:22000" ];
  });

  vaultPath =
    if hostName == "beelink" then
      "${config.home.homeDirectory}/obsidian/KostyaVault"
    else
      "${config.home.homeDirectory}/Documents/KostyaVault";

  makerEnabled = hostName != "mac-mini";
  makerPath =
    if hostName == "beelink" then
      "${config.home.homeDirectory}/maker"
    else
      "${config.home.homeDirectory}/repos/maker";
  makerPeer = if hostName == "beelink" then "macbook" else "beelink";

  guiAddress = if hostName == "beelink" then "100.109.202.73:8384" else "127.0.0.1:8384";
  syncthingPackage =
    inputs.nixpkgs-unstable.legacyPackages.${pkgs.stdenv.hostPlatform.system}.syncthing;
in
{
  assertions = [
    {
      assertion = builtins.hasAttr hostName deviceIds;
      message = "Syncthing is not configured for host ${hostName}.";
    }
  ];

  # Keep the service binary and interactive CLI on the same version. Syncthing
  # identities remain local; device IDs are public identifiers, not secrets.
  home.packages = [ syncthingPackage ];

  services.syncthing = {
    enable = true;
    package = syncthingPackage;
    inherit guiAddress;

    # Nix owns peer and folder topology while preserving each host's local
    # certificate, private key, database, and GUI credentials.
    overrideDevices = true;
    overrideFolders = true;

    settings = {
      gui.address = guiAddress;
      options = {
        globalAnnounceEnabled = false;
        localAnnounceEnabled = false;
        relaysEnabled = false;
        listenAddresses = [ "tcp://${tailscaleIps.${hostName}}:22000" ];
      };
      devices = peerDevices;
      folders = {
        kostya-vault = {
          id = "kostya-vault";
          label = "KostyaVault";
          path = vaultPath;
          devices = peerNames;
          type = if hostName == "beelink" then "receiveonly" else "sendreceive";
          versioning =
            if hostName == "beelink" then
              {
                type = "staggered";
                params = {
                  cleanInterval = "3600";
                  maxAge = "31536000";
                };
              }
            else
              null;
        };

        # Keep the existing MacBook ↔ Beelink share unchanged. This folder is
        # intentionally absent from the Mac mini.
        maker = {
          enable = makerEnabled;
          id = "maker";
          label = "maker";
          path = makerPath;
          devices = [ makerPeer ];
          type = "sendreceive";
        };
      };
    };
  };
}
