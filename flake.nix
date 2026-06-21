{
  description = "kostyafarber dotfiles — one home-manager config for macOS + Linux";

  inputs = {
    # Pinned to a stable release for predictability. Bump both together.
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
    home-manager = {
      url = "github:nix-community/home-manager/release-25.11";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, home-manager, ... }:
    let
      # Helper: build a standalone home-manager config from the shared
      # `common.nix` plus a per-host module.
      mkHome = { system, hostModule }:
        home-manager.lib.homeManagerConfiguration {
          pkgs = nixpkgs.legacyPackages.${system};
          modules = [ ./nix/home/common.nix hostModule ];
        };
    in
    {
      homeConfigurations = {
        # The Ubuntu home server. Apply with:
        #   home-manager switch --flake ~/.dotfiles#firmclaw@box
        "firmclaw@box" = mkHome {
          system = "x86_64-linux";
          hostModule = ./nix/home/box.nix;
        };

        # The MacBook (phase 2). Apply with:
        #   home-manager switch --flake ~/.dotfiles#kostyafarber@mac
        "kostyafarber@mac" = mkHome {
          system = "aarch64-darwin";
          hostModule = ./nix/home/mac.nix;
        };
      };
    };
}
