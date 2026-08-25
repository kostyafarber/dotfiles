{
  config,
  lib,
  pkgs,
  ...
}:

# Shared Home Manager configuration for Darwin workstations.
let
  dotfiles = "${config.home.homeDirectory}/.dotfiles";

  # Markdown preview extension for MarkEdit (Shift-Cmd-V in the app).
  # Bump: update version + `nix store prefetch-file --unpack <url>` for the hash.
  markeditPreview = pkgs.fetchzip {
    url = "https://github.com/MarkEdit-app/MarkEdit-preview/releases/download/v1.8.1/MarkEdit-preview-1.8.1.zip";
    hash = "sha256-UnOLTN4Xj5kpH9tw2WEXhLCheTmzctx+LA+caAOc4aA=";
    stripRoot = false; # zip has a __MACOSX sibling dir, so can't strip
  };
in
{
  # Mac clipboard image extraction for the Raycast → remote box bridge.
  home.packages = [ pkgs.pngpaste ];

  # nix's git wins on PATH over brew git and ignores Apple's /etc/gitconfig, so
  # it loses the osxkeychain helper the system git had. Re-declare it (mac-only;
  # the helper binary ships with nixpkgs git) so HTTPS pushes keep using the
  # keychain instead of prompting.
  programs.git.settings.credential.helper = "osxkeychain";

  # GUI app configs (mac-only), kept editable in-repo via out-of-store symlinks
  xdg.configFile."ghostty/config".source =
    config.lib.file.mkOutOfStoreSymlink "${dotfiles}/ghostty/.config/ghostty/config";
  xdg.configFile."ghostty/themes".source =
    config.lib.file.mkOutOfStoreSymlink "${dotfiles}/ghostty/.config/ghostty/themes";
  home.file.".wezterm.lua".source =
    config.lib.file.mkOutOfStoreSymlink "${dotfiles}/wezterm/.wezterm.lua";

  # MarkEdit extensions live inside the app's sandbox container. Real copy, not
  # a store symlink — the sandbox can't follow links out to /nix/store.
  home.activation.markeditExtensions = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
    markeditScripts="$HOME/Library/Containers/app.cyan.markedit/Data/Documents/scripts"
    run mkdir -p "$markeditScripts"
    run cp -f ${markeditPreview}/MarkEdit-preview-1.8.1/dist/markedit-preview.js "$markeditScripts/"
    run chmod 644 "$markeditScripts/markedit-preview.js"
  '';

  # MarkEdit as the default app for markdown files (idempotent; the workstation
  # profile installs the cask before Home Manager activation).
  home.activation.markdownDefaultApp = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
    if [ -d /Applications/MarkEdit.app ]; then
      run ${pkgs.duti}/bin/duti -s app.cyan.markedit .md all
      run ${pkgs.duti}/bin/duti -s app.cyan.markedit .markdown all
      run ${pkgs.duti}/bin/duti -s app.cyan.markedit net.daringfireball.markdown all
    fi
  '';

  programs.zsh.shellAliases = {
    # ladybird dev (mac, brew-provided llvm)
    lc = "./Meta/ladybird.sh delete";
    lr = "CC=$(brew --prefix llvm)/bin/clang CXX=$(brew --prefix llvm)/bin/clang++ ./Meta/ladybird.sh run ladybird";
    lrd = "CC=$(brew --prefix llvm)/bin/clang CXX=$(brew --prefix llvm)/bin/clang++ BUILD_PRESET=Debug ./Meta/ladybird.sh run ladybird";
    lt = "cmake --preset default && cmake --build --preset default && ctest --preset default";
    lts = "cmake --preset Sanitizer && cmake --build --preset Sanitizer && ctest --preset Sanitizer";
    lqon = "cmake --preset default -DENABLE_QT=ON";
    lqoff = "cmake --preset default -DENABLE_QT=OFF";
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

    # node comes from nix (common.nix nodejs_24) — nvm + the per-cd load-nvmrc
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
