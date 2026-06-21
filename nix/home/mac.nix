{ config, lib, ... }:

# MacBook. Shared core comes from common.nix; this adds the mac-only bits.
let
  dotfiles = "${config.home.homeDirectory}/.dotfiles";
in
{
  home.username = "kostyafarber";
  home.homeDirectory = "/Users/kostyafarber";

  # which flake output `hms`/`update` apply on this host (.zshenv → every shell)
  programs.zsh.envExtra = ''export DOTFILES_HM_TARGET="kostyafarber@mac"'';

  # GUI app configs (mac-only), kept editable in-repo via out-of-store symlinks
  xdg.configFile."ghostty/config".source =
    config.lib.file.mkOutOfStoreSymlink "${dotfiles}/ghostty/.config/ghostty/config";
  xdg.configFile."ghostty/themes".source =
    config.lib.file.mkOutOfStoreSymlink "${dotfiles}/ghostty/.config/ghostty/themes";
  home.file.".wezterm.lua".source =
    config.lib.file.mkOutOfStoreSymlink "${dotfiles}/wezterm/.wezterm.lua";
  home.file."Library/Application Support/Code/User/settings.json".source =
    config.lib.file.mkOutOfStoreSymlink "${dotfiles}/vscode/Library/Application Support/Code/User/settings.json";
  home.file."Library/Application Support/Code/User/keybindings.json".source =
    config.lib.file.mkOutOfStoreSymlink "${dotfiles}/vscode/Library/Application Support/Code/User/keybindings.json";

  programs.zsh.shellAliases = {
    # ladybird dev (mac, brew-provided llvm)
    lc = "./Meta/ladybird.sh delete";
    lr = "CC=$(brew --prefix llvm)/bin/clang CXX=$(brew --prefix llvm)/bin/clang++ ./Meta/ladybird.sh run ladybird";
    lrd = "CC=$(brew --prefix llvm)/bin/clang CXX=$(brew --prefix llvm)/bin/clang++ BUILD_PRESET=Debug ./Meta/ladybird.sh run ladybird";
    lt = "cmake --preset default && cmake --build --preset default && ctest --preset default";
    lts = "cmake --preset Sanitizer && cmake --build --preset Sanitizer && ctest --preset Sanitizer";
    lqon = "cmake --preset default -DENABLE_QT=ON";
    lqoff = "cmake --preset default -DENABLE_QT=OFF";

    # quick attach to the box's persistent codex session
    clawdex = ''ssh -t clawsh "tmux new -A -s codex"'';
  };

  # mkAfter so this runs at the end of the generated .zshrc (matches the order
  # your old zshrc relied on, e.g. ~/.work applying keybindings last).
  programs.zsh.initContent = lib.mkAfter ''
    # --- bridge to existing mac-only shell config (not yet Nixified) ---

    # secret + work env/aliases (your `clawsh` alias lives in ~/.secrets)
    [ -f "$HOME/.secrets" ] && source "$HOME/.secrets"

    # Homebrew on PATH (casks/GUI tools + ladybird deps), but keep nix-managed
    # tools ahead of brew so versions stay pinned + consistent with the box.
    if [ -x /opt/homebrew/bin/brew ]; then
      eval "$(/opt/homebrew/bin/brew shellenv)"
      export PATH="${config.home.profileDirectory}/bin:$PATH"
    fi

    # Java / Haskell toolchains
    [ -d /opt/homebrew/opt/openjdk/bin ] && export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
    [ -f "$HOME/.ghcup/env" ] && source "$HOME/.ghcup/env"

    # pnpm
    export PNPM_HOME="$HOME/Library/pnpm"
    case ":$PATH:" in
      *":$PNPM_HOME:"*) ;;
      *) export PATH="$PNPM_HOME:$PATH" ;;
    esac

    # node comes from nix (common.nix nodejs_22) — nvm + the per-cd load-nvmrc
    # hook were dropped. `corepack enable` once if you want pnpm/yarn shims.

    # Ctrl-F: fuzzy-pick a project and open its tmux session (local)
    bindkey -s '^F' '^Utmux-sessionizer^M'

    # work config last (it applies keybindings; mirrors your old zshrc ordering)
    [ -f "$HOME/.work" ] && source "$HOME/.work"

    # clawf: fuzzy-pick a repo ON the box and attach/create its tmux session.
    clawf() {
      local selected
      selected=$(ssh clawsh 'find "$HOME/repos" -mindepth 1 -maxdepth 1 -type d ! -name ".*" 2>/dev/null' \
        | fzf --reverse --border --height=60% --prompt="box project> " ''${1:+--query "$1"})
      [[ -z $selected ]] && return 0
      local name=$(basename "$selected")
      name=''${name//./_}
      ssh -t clawsh "tmux new -A -s \"$name\" -c \"$selected\""
    }
  '';
}
