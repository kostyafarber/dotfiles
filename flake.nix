{
  description = "kostyafarber dotfiles — nix-darwin Macs + Home Manager Linux";

  inputs = {
    # Stable by default; unstable is used only for state-schema-sensitive tools
    # that must not lag behind their existing on-disk data.
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
    nixpkgs-unstable.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

    home-manager = {
      url = "github:nix-community/home-manager/release-25.11";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    nix-darwin = {
      url = "github:nix-darwin/nix-darwin/nix-darwin-25.11";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    # Installs Homebrew itself; nix-darwin manages the declared formulae/casks.
    nix-homebrew.url = "github:zhaofengli/nix-homebrew";

    # Terminal diff viewer for reviewing agent-authored changes.
    hunk = {
      url = "github:modem-dev/hunk";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    inputs@{
      nixpkgs,
      home-manager,
      nix-darwin,
      nix-homebrew,
      ...
    }:
    let
      # Standalone Home Manager remains appropriate for the Ubuntu server.
      mkHome =
        { system, hostModule }:
        home-manager.lib.homeManagerConfiguration {
          pkgs = nixpkgs.legacyPackages.${system};
          extraSpecialArgs = { inherit inputs; };
          modules = [
            ./nix/home/common.nix
            hostModule
          ];
        };

      # Every Mac shares the Darwin/Home Manager foundation; host modules only
      # select profiles and declare physical-machine differences.
      mkDarwinHost =
        hostModule:
        nix-darwin.lib.darwinSystem {
          system = "aarch64-darwin";
          specialArgs = { inherit inputs; };
          modules = [
            home-manager.darwinModules.home-manager
            nix-homebrew.darwinModules.nix-homebrew
            ./nix/darwin/common.nix
            hostModule
          ];
        };
    in
    {
      darwinConfigurations = {
        macbook = mkDarwinHost ./nix/hosts/macbook.nix;
        mac-mini = mkDarwinHost ./nix/hosts/mac-mini.nix;
      };

      homeConfigurations = {
        "kostyafarber@beelink" = mkHome {
          system = "x86_64-linux";
          hostModule = ./nix/home/beelink.nix;
        };
      };
    };
}
