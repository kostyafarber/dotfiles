{
  description = "kostyafarber dotfiles — one home-manager config for macOS + Linux";

  inputs = {
    # Pinned to a stable release for predictability. Bump both together.
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
    home-manager = {
      url = "github:nix-community/home-manager/release-25.11";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    # hunk — terminal diff viewer for reviewing agent-authored changes (box
    # only; wired up in nix/home/box.nix). Follows our nixpkgs so we don't drag
    # a second copy of it into the store.
    hunk = {
      url = "github:modem-dev/hunk";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { nixpkgs, home-manager, ... }@inputs:
    let
      # Helper: build a standalone home-manager config from the shared
      # `common.nix` plus a per-host module. `inputs` is passed through to the
      # modules (extraSpecialArgs) so a per-host module can pull in flake inputs
      # — e.g. box.nix importing hunk's home-manager module.
      mkHome = { system, hostModule }:
        home-manager.lib.homeManagerConfiguration {
          pkgs = nixpkgs.legacyPackages.${system};
          extraSpecialArgs = { inherit inputs; };
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
