# Dotfiles

Declarative configuration for two Apple Silicon Macs and an Ubuntu home server.

- **nix-darwin** manages macOS defaults, Homebrew, login shells, and host roles.
- **Home Manager** manages shell tools, editors, tmux, and live dotfile links.
- **Home Manager standalone** manages the Ubuntu Beelink server.

## Hosts

| Flake output | Role |
| --- | --- |
| `darwinConfigurations.macbook` | Darwin workstation |
| `darwinConfigurations.mac-mini` | Darwin workstation + always-on host |
| `homeConfigurations."kostyafarber@beelink"` | Linux server |

Host modules compose reusable profiles from `nix/profiles/`; they should contain
only the physical hostname and host-specific differences.

## Bootstrap

On a fresh machine, clone this repository to `~/.dotfiles`, then run:

```bash
./bootstrap-nix.sh mac-mini       # new Mac mini
./bootstrap-nix.sh macbook        # MacBook
./bootstrap-nix.sh kostyafarber@beelink # Ubuntu Beelink
```

The bootstrap installs Determinate Nix when needed. On Darwin, nix-homebrew
installs or adopts Homebrew before nix-darwin applies the declared casks.

## Day-to-day commands

```bash
rebuild  # apply this host's current checkout
update   # pull with rebase/autostash, then rebuild
hms      # temporary compatibility alias for rebuild
```

Darwin rebuilds use `sudo darwin-rebuild`; Beelink uses standalone Home Manager.
The target is selected by each host module through `DOTFILES_TARGET`.

SSH aliases on either Mac are:

```bash
ssh mini         # Mac mini over Bonjour
ssh beelink      # Ubuntu server over Tailscale MagicDNS
ssh beelink-dev  # Beelink plus local forwards for ports 5173 and 5174
```

## Configuration layout

```text
flake.nix
nix/
├── darwin/common.nix
├── home/
│   ├── common.nix
│   ├── mac.nix
│   └── beelink.nix
├── hosts/
│   ├── macbook.nix
│   └── mac-mini.nix
└── profiles/
    ├── workstation.nix
    ├── always-on.nix
    └── syncthing.nix
```

Editable application configuration remains in this repository and is linked by
Home Manager with out-of-store symlinks.

## Syncthing and Obsidian

Home Manager runs Syncthing on both Macs while preserving the local Syncthing
identity and mutable peer configuration. The Obsidian vault is:

```text
~/Documents/KostyaVault
```

Pair a new machine through Syncthing once it has generated its unique device ID.
On every newly paired device, set `KostyaVault` to staggered file versioning with
one year of retention; this is local device state until peer IDs are declared in
Nix. Syncthing propagates changes and deletions, so it is not a substitute for an
independent backup.

## Homebrew migration

`nix/profiles/workstation.nix` is the authoritative GUI application list.
`mac/essential/Brewfile` is a temporary legacy inventory and must not be applied
on a new machine. nix-darwin intentionally does not uninstall undeclared casks;
pruning installed applications is an explicit manual step.
