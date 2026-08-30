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

Interactive SSH sessions on the Mac mini and Beelink automatically attach or
create the tmux session `main`. To bypass tmux for recovery:

```bash
ssh -t beelink 'NO_AUTO_TMUX=1 zsh -il'
ssh -t mini 'NO_AUTO_TMUX=1 zsh -il'
```

The tmux status bar identifies each host by label and color: MacBook is gold,
Mac mini is green, and Beelink is blue.

## Configuration layout

```text
flake.nix
nix/
├── darwin/common.nix
├── home/
│   ├── common.nix
│   ├── mac.nix
│   ├── beelink.nix
│   └── syncthing.nix
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

## Syncthing

`nix/home/syncthing.nix` declares the service, Tailscale-only peer addresses,
and folder topology. Each host retains its own local Syncthing identity and
database.

| Folder | MacBook | Mac mini | Beelink |
| --- | --- | --- | --- |
| `KostyaVault` | `~/Documents/KostyaVault` (send/receive) | `~/Documents/KostyaVault` (send/receive) | `~/obsidian/KostyaVault` (receive-only, one-year staggered versioning) |
| `maker` | `~/repos/maker` (send/receive) | Not configured | `~/maker` (send/receive) |

Syncthing is replication, not an independent backup.

## Homebrew

`nix/profiles/workstation.nix` is the authoritative GUI application list.
`mac/essential/Brewfile` is a legacy inventory and is not part of bootstrap.
nix-darwin does not remove undeclared casks.
