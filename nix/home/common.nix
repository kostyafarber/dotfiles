{
  config,
  pkgs,
  lib,
  inputs,
  osConfig ? null,
  ...
}:

let
  # Live path to the dotfiles checkout. Used for configs we want to stay
  # editable in-repo (nvim, lazygit, scripts) instead of becoming read-only
  # copies in the nix store.
  dotfiles = "${config.home.homeDirectory}/.dotfiles";

  # Clipboard sink for tmux copy-mode. On macOS we pipe to pbcopy; on Linux
  # (headless server) we rely on tmux `set-clipboard on` (OSC52) and use a no-op
  # sink so the binding still parses.
  copyCmd = if pkgs.stdenv.isDarwin then "pbcopy" else "cat";

  # Physical host identity in the tmux status bar. Distinct accents make the
  # local MacBook, remote Mac mini, and Beelink recognizable at a glance.
  hostLabel = if osConfig != null then osConfig.networking.hostName else "beelink";
  hostColor =
    if hostLabel == "macbook" then
      "#D7BA7D"
    else if hostLabel == "mac-mini" then
      "#7DC4A4"
    else
      "#7AA2D7";

  rebuildCommand =
    if pkgs.stdenv.isDarwin then
      ''sudo /run/current-system/sw/bin/darwin-rebuild switch --flake "$HOME/.dotfiles#$target"''
    else
      ''home-manager switch --flake "$HOME/.dotfiles#$target"'';
in
{
  # home-manager's state version. Set once at first install; don't bump
  # casually (it gates a few backwards-compat behaviours, not package versions).
  home.stateVersion = "25.11";

  programs.home-manager.enable = true;

  # ---------------------------------------------------------------------------
  # Packages present on every machine (replaces ad-hoc brew/apt installs)
  # ---------------------------------------------------------------------------
  home.packages = with pkgs; [
    ripgrep
    fd
    bat
    eza
    jq
    tree
    htop
    curl
    wget
    gh
    gnumake
    unzip
    uv # replaces conda
    nodejs_24
    erlang
    rebar3
    fastfetch
    pokemon-colorscripts
  ];

  home.sessionVariables = {
    EDITOR = "nvim";
    VISUAL = "nvim";
    FZF_DEFAULT_OPTS_FILE = "${config.home.homeDirectory}/.local/state/theme/fzf.conf";

    # nix's nodejs has a read-only global prefix (the store), so npm's global
    # installs need a writable prefix in $HOME. Pi's official installer
    # (`curl -fsSL https://pi.dev/install.sh | sh`) honors this prefix.
    NPM_CONFIG_PREFIX = "${config.home.homeDirectory}/.npm-global";

    # prefix+f should offer PR worktrees (made by `pco`) next to real clones
    TMUX_SESSIONIZER_PATHS = "${config.home.homeDirectory}/repos:${config.home.homeDirectory}/worktrees";
  };

  # Put the npm-global bin dir on PATH. This is where Pi's installer and other
  # fast-moving npm CLIs drop shims.
  home.sessionPath = [ "${config.home.homeDirectory}/.npm-global/bin" ];

  # ---------------------------------------------------------------------------
  # git
  # ---------------------------------------------------------------------------
  programs.git = {
    enable = true;
    settings.user.name = "Kostya Farber";
    settings.user.email = "kostya.farber@gmail.com";
  };

  # delta as the pager for `git diff`/`show`/`log -p` (lazygit already used it
  # via its own [delta "lazygit"] feature; this wires it into the CLI too).
  # Matches your light/GitHub aesthetic; `navigate` = n/N to jump between files.
  programs.delta = {
    enable = true;
    enableGitIntegration = true;
    options = {
      navigate = true;
      light = true;
      line-numbers = true;
      syntax-theme = "GitHub";
    };
  };

  # ---------------------------------------------------------------------------
  # prompt — replaces `oh-my-posh init ... agnoster.omp.json` via brew
  # ---------------------------------------------------------------------------
  programs.oh-my-posh = {
    enable = true;
    useTheme = "agnoster";
  };

  # fastfetch — binary lives in home.packages; use your real config (its logo
  # is read from stdin, so the pokemon art piped in becomes the logo). The
  # greeting itself is wired in the zsh initContent below.
  xdg.configFile."fastfetch/config.jsonc".source =
    config.lib.file.mkOutOfStoreSymlink "${dotfiles}/fastfetch/.config/fastfetch/config.jsonc";

  # directory jumping — replaces the oh-my-zsh `z` plugin
  programs.zoxide.enable = true;

  # fzf reads its active palette from theme state, switched by `theme` / `tt`.
  programs.fzf.enable = true;
  xdg.configFile."fzf/themes/catppuccin-latte.conf".source =
    config.lib.file.mkOutOfStoreSymlink "${dotfiles}/fzf/.config/fzf/themes/catppuccin-latte.conf";
  xdg.configFile."fzf/themes/catppuccin-mocha.conf".source =
    config.lib.file.mkOutOfStoreSymlink "${dotfiles}/fzf/.config/fzf/themes/catppuccin-mocha.conf";

  # ---------------------------------------------------------------------------
  # lazygit — binary from nix, config symlinked live from the repo
  # ---------------------------------------------------------------------------
  programs.lazygit.enable = true;
  xdg.configFile."lazygit/config.yml".source =
    config.lib.file.mkOutOfStoreSymlink "${dotfiles}/lazygit/.config/lazygit/config.yml";

  # ---------------------------------------------------------------------------
  # pi coding agent — keep static config/extensions/prompts/themes in dotfiles.
  # Secrets and runtime state stay unmanaged in ~/.pi/agent:
  # auth.json, models-store.json, sessions/.
  # ---------------------------------------------------------------------------
  home.file.".pi/agent/AGENTS.md".source =
    config.lib.file.mkOutOfStoreSymlink "${dotfiles}/pi/.pi/agent/AGENTS.md";
  home.file.".pi/agent/settings.json".source =
    config.lib.file.mkOutOfStoreSymlink "${dotfiles}/pi/.pi/agent/settings.json";
  home.file.".pi/agent/extensions".source =
    config.lib.file.mkOutOfStoreSymlink "${dotfiles}/pi/.pi/agent/extensions";
  home.file.".pi/agent/skills/worktree".source =
    config.lib.file.mkOutOfStoreSymlink "${dotfiles}/pi/.pi/agent/skills/worktree";
  home.file.".pi/agent/prompts".source =
    config.lib.file.mkOutOfStoreSymlink "${dotfiles}/pi/.pi/agent/prompts";
  home.file.".pi/agent/themes".source =
    config.lib.file.mkOutOfStoreSymlink "${dotfiles}/pi/.pi/agent/themes";

  # Keep ignored node_modules in local Pi extensions synchronized with their
  # checked-in lockfiles. The marker avoids reinstalling on every switch; npm ls
  # also catches partially deleted or otherwise broken dependency trees.
  home.activation.piExtensionDependencies = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
    extensionRoot=${lib.escapeShellArg "${dotfiles}/pi/.pi/agent/extensions"}
    if [ -d "$extensionRoot" ]; then
      for lockfile in "$extensionRoot"/*/package-lock.json; do
        [ -e "$lockfile" ] || continue
        extensionDir="''${lockfile%/package-lock.json}"
        marker="$extensionDir/node_modules/.pi-package-lock.json"

        if ! ${pkgs.diffutils}/bin/cmp -s "$lockfile" "$marker" \
          || ! ${pkgs.nodejs_24}/bin/npm --prefix "$extensionDir" ls --omit=dev --depth=0 >/dev/null 2>&1; then
          echo "Installing Pi extension dependencies: ''${extensionDir##*/}"
          if (cd "$extensionDir" && run ${pkgs.nodejs_24}/bin/npm ci --omit=dev --no-audit --no-fund); then
            run ${pkgs.coreutils}/bin/cp "$lockfile" "$marker"
          else
            echo "Failed to install Pi extension dependencies in $extensionDir" >&2
            exit 1
          fi
        fi
      done
    fi
  '';

  # ---------------------------------------------------------------------------
  # hunk — terminal diff viewer for reviewing changes, especially agent-authored
  # ones (`hunk diff` for the working tree, `hunk show` for the last commit,
  # `hunk diff --watch` to live-reload while an agent keeps editing). On both
  # hosts: the Beelink server (where codex runs) and the Mac.
  # ---------------------------------------------------------------------------
  imports = [ inputs.hunk.homeManagerModules.default ];

  programs.hunk = {
    enable = true;

    # The module defaults `package` to `pkgs.hunk` (an overlay we don't add), so
    # point it at the flake's output for whichever host we're on — resolves to
    # aarch64-darwin on the Mac, x86_64-linux on the Beelink.
    package = inputs.hunk.packages.${pkgs.stdenv.hostPlatform.system}.hunk;

    # Leave git's pager alone — you drive git through lazygit + explicit
    # `hunk diff`. Flip to true if you'd rather `git diff`/`show`/`log` page
    # through hunk automatically.
    enableGitIntegration = false;

    # Serialized to hunk's TOML config (keys: github.com/modem-dev/hunk#config).
    # Carried over from your hand-written ~/.config/hunk/config.toml so nix
    # reproduces it; catppuccin-latte matches your fzf palette in this file.
    settings = {
      theme = "catppuccin-latte";
      mode = "auto"; # split | stack | auto (responsive)
      line_numbers = true;
      menu_bar = false;
      watch = false;
    };
  };

  # ---------------------------------------------------------------------------
  # neovim — install the binary; keep your existing lazy.nvim config editable
  # in-repo (so lazy-lock.json stays writable and edits land in the repo)
  # ---------------------------------------------------------------------------
  programs.neovim = {
    enable = true;
    defaultEditor = true;
    viAlias = true;
    vimAlias = true;
  };
  xdg.configFile."nvim".source = config.lib.file.mkOutOfStoreSymlink "${dotfiles}/nvim/.config/nvim";

  # ---------------------------------------------------------------------------
  # tmux — module handles prefix/mouse/vi; extraConfig carries your bindings.
  # tpm is dropped: plugins are managed by nix below.
  # ---------------------------------------------------------------------------
  programs.tmux = {
    enable = true;
    prefix = "C-Space";
    keyMode = "vi";
    mouse = true;
    escapeTime = 10;
    historyLimit = 50000;
    terminal = "tmux-256color";
    plugins = with pkgs.tmuxPlugins; [
      sensible
      pain-control
    ];
    extraConfig = ''
      # Preserve modified keys for Pi and other TUIs
      set -g extended-keys on
      set -g extended-keys-format csi-u

      # cross-terminal clipboard (works headless over SSH via OSC52)
      set -g set-clipboard on

      # Pass OSC 8 hyperlinks through to the outer terminal
      set -as terminal-features ",*:hyperlinks"
      set -g allow-passthrough on

      # window titles
      set -g set-titles on
      set -g set-titles-string "#S · #W"

      setw -g monitor-activity on

      # multi-key "clear" table: prefix c then h -> clear-history
      bind-key -T prefix c switch-client -T clear-keys
      bind-key -T clear-keys h clear-history

      # copy-mode (vi)
      bind-key Escape copy-mode
      bind -T copy-mode-vi y send-keys -X copy-pipe-and-cancel '${copyCmd}'
      bind-key -T copy-mode-vi Escape send-keys -X clear-selection
      bind -T copy-mode-vi Enter send -X copy-pipe-and-cancel '${copyCmd}'
      bind-key -T copy-mode-vi 'v' send -X begin-selection

      # splits
      bind '\' split-window -h
      bind '-' split-window -v
      unbind '"'
      unbind '%'

      # resize with alt-arrows
      bind -n M-Up resize-pane -U
      bind -n M-Down resize-pane -D
      bind -n M-Left resize-pane -L
      bind -n M-Right resize-pane -R

      # reload (config now lives under XDG)
      unbind r
      bind r source-file ~/.config/tmux/tmux.conf \; display "tmux reloaded"

      # vim-style pane select
      bind h select-pane -L
      bind j select-pane -D
      bind k select-pane -U
      bind l select-pane -R

      # project sessionizer
      bind-key f run-shell "tmux neww ~/.local/bin/tmux-sessionizer"

      # status bar — bg colour + left label differ per host (hostColor/hostLabel)
      set -g status-interval 1
      set -g status-justify centre
      set -g status-left-length 30
      set -g status-right-length 80
      set -g status-position bottom
      set -g status-style bg='${hostColor}',fg='#1E1E1E'
      set -g status-left "#[bold] ${hostLabel} · #S "

      # sane mouse-wheel scrolling (1 line per step)
      unbind -T root WheelUpPane
      unbind -T root WheelDownPane
      bind -T root WheelUpPane if -F "#{mouse_any_flag}" "send -M" "copy-mode -e; send -N 1 -X scroll-up"
      bind -T root WheelDownPane if -F "#{mouse_any_flag}" "send -M" "copy-mode -e; send -N 1 -X scroll-down"
      bind -T copy-mode-vi WheelUpPane   send -N 1 -X scroll-up
      bind -T copy-mode-vi WheelDownPane send -N 1 -X scroll-down
    '';
  };

  # your project sessionizer (prefix+f), kept editable in-repo
  home.file.".local/bin/tmux-sessionizer".source =
    config.lib.file.mkOutOfStoreSymlink "${dotfiles}/tmux/.local/bin/tmux-sessionizer";

  # dark/light theme switcher for nvim + ghostty (`theme dark|light|toggle`)
  home.file.".local/bin/theme".source =
    config.lib.file.mkOutOfStoreSymlink "${dotfiles}/zshrc/bin/theme";
  home.file.".local/bin/tt".source = config.lib.file.mkOutOfStoreSymlink "${dotfiles}/zshrc/bin/tt";

  # check a GitHub PR out from anywhere, into its own worktree + tmux session
  # (`pco <url>`, `pco 123`, `pco ls`, `pco rm 123`)
  home.file.".local/bin/pco".source = config.lib.file.mkOutOfStoreSymlink "${dotfiles}/zshrc/bin/pco";

  # ---------------------------------------------------------------------------
  # Project development environments — activate trusted .envrc files on cd and
  # cache Nix flake dev shells between entries.
  # ---------------------------------------------------------------------------
  programs.direnv = {
    enable = true;
    enableZshIntegration = true;
    nix-direnv.enable = true;
  };

  # ---------------------------------------------------------------------------
  # zsh — lean: oh-my-zsh dropped (prompt = oh-my-posh, `z` = zoxide,
  # autosuggestion native, completion handled by home-manager). Conda / nvm /
  # brew-path hacks pruned.
  # ---------------------------------------------------------------------------
  programs.zsh = {
    enable = true;
    autosuggestion.enable = true;
    defaultKeymap = "viins"; # set -o vi

    # PATH for every shell, including non-login SSH commands. Put Nix-managed
    # tools, local scripts, Pi's installer prefix, and rustup on PATH there.
    envExtra = ''
      # Move managed tools to the front even when a parent process inherited
      # the same directories later in PATH (for example Codex or an SSH shell).
      typeset -U path PATH
      path=("$HOME/.nix-profile/bin" "$HOME/.local/bin" "$HOME/.npm-global/bin" $path)
      export PATH
      [ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"

      # Drop the old fixed Latte value from inherited environments. fzf reads
      # this stable state path on every launch, so `tt` affects existing shells.
      unset FZF_DEFAULT_OPTS
      export FZF_DEFAULT_OPTS_FILE="$HOME/.local/state/theme/fzf.conf"
      if [[ ! -e "$FZF_DEFAULT_OPTS_FILE" ]]; then
        mkdir -p "$HOME/.local/state/theme"
        if [[ -r "$HOME/.local/state/theme/mode" ]] &&
           [[ "$(< "$HOME/.local/state/theme/mode")" == dark ]]; then
          ln -sfn "$HOME/.config/fzf/themes/catppuccin-mocha.conf" "$FZF_DEFAULT_OPTS_FILE"
        else
          ln -sfn "$HOME/.config/fzf/themes/catppuccin-latte.conf" "$FZF_DEFAULT_OPTS_FILE"
        fi
      fi
    '';

    shellAliases = {
      e = "exit";
      # Compatibility alias; `rebuild` selects darwin-rebuild or Home Manager.
      hms = "rebuild";
      c = "claude";
      cs = "claude --dangerously-skip-permissions";
      csf = "claude --dangerously-skip-permissions --model haiku";
      # codex in full-auto: no approval prompts, no sandbox (mainly for Beelink)
      cxs = "codex --dangerously-bypass-approvals-and-sandbox";
      pi-install = "curl -fsSL https://pi.dev/install.sh | sh";

      nrd = "npm run dev";
      drc = "nvim $HOME/.dotfiles";
      vrc = "nvim $HOME/.zshrc";
      crc = "nvim $HOME/.claude";
      # Home Manager session variables are guarded against double-sourcing.
      # Clear both guards so long-lived tmux panes pick up a new generation.
      src = "unset __HM_SESS_VARS_SOURCED __HM_ZSH_SESS_VARS_SOURCED; exec zsh";
      salias = "alias | fzf --preview 'echo {}' --preview-window=up:3:wrap";

      # modern CLI replacements (eza/bat) + oh-my-zsh conveniences
      ls = "eza --group-directories-first";
      ll = "eza -l --git --group-directories-first";
      la = "eza -la --git --group-directories-first";
      cat = "bat -pp";
      ".." = "cd ..";
      "..." = "cd ../..";

      # git
      lg = "lazygit";
      gc = "git commit";
      grh = "git reset HEAD~1";
      gcr = "git commit --reuse-message=ORIG_HEAD";
      gca = "git commit --amend";
      gcan = "git commit --amend --no-verify";
      gta = "git add .";
      gpo = "git push origin";
      gpof = "git push origin --force";
      gt = "git status";
      gp = "git pull";
      gl = "git log";
      gcm = "git checkout main";
      gb = "git stash && git pull && git stash pop";
      gs = "git stash";
      gtp = "git stash pop";
      gsu = "git pull upstream master && git push origin";
    };

    initContent = ''
      # Interactive SSH sessions on always-on hosts live in one persistent tmux
      # session. Non-interactive SSH commands remain unaffected.
      if [[ -n "$SSH_TTY" && -z "$TMUX" && "$NO_AUTO_TMUX" != 1 ]] && \
         [[ "$DOTFILES_TARGET" == "mac-mini" || "$DOTFILES_TARGET" == "kostyafarber@beelink" ]]; then
        exec tmux new-session -A -s main
      fi

      # sane option previously set by oh-my-zsh
      setopt AUTO_CD

      # --- functions ported from your zshrc ---
      tempe () {
        cd "$(mktemp -d)"
        chmod -R 0700 .
        if [[ $# -eq 1 ]]; then
          \mkdir -p "$1"
          cd "$1"
          chmod -R 0700 .
        fi
      }

      gco() {
        local branch=$(git branch -a --format='%(refname:short)' --sort=-committerdate | \
          grep -v '^HEAD$' | \
          fzf --exact --ansi \
              --preview 'git log --oneline --color -n 5 {} && echo "" && git diff --stat --color HEAD...{} 2>/dev/null' \
              --preview-window=right:60%)
        if [ -n "$branch" ]; then
          branch="''${branch#origin/}"
          git checkout "$branch"
        fi
      }

      # Rebuild the current physical host. DOTFILES_TARGET is set by its host
      # module, while the command differs between Darwin and standalone Linux.
      rebuild() {
        local target="$DOTFILES_TARGET"
        [ -z "$target" ] && { echo "rebuild: \$DOTFILES_TARGET is unset" >&2; return 1; }
        ${rebuildCommand}
      }

      # Pull the latest dotfiles and apply this host's configuration.
      update() {
        local dir="$HOME/.dotfiles"
        git -C "$dir" pull --rebase --autostash || return 1
        rebuild
      }

      # _dotfiles_status: silent unless ~/.dotfiles has drifted. A throttled
      # (<=hourly) background fetch keeps the "behind" count fresh without blocking.
      _dotfiles_status() {
        local dir="$HOME/.dotfiles"
        [ -d "$dir/.git" ] || return
        if [ -z "$(find "$dir/.git/FETCH_HEAD" -mmin -60 2>/dev/null)" ]; then
          ( git -C "$dir" fetch -q --no-tags >/dev/null 2>&1 & )
        fi
        local dirty ahead behind msg=""
        dirty=$(git -C "$dir" status --porcelain 2>/dev/null | grep -c .)
        ahead=$(git -C "$dir" rev-list --count @{upstream}..HEAD 2>/dev/null)
        behind=$(git -C "$dir" rev-list --count HEAD..@{upstream} 2>/dev/null)
        (( dirty          > 0 )) && msg+="✎$dirty uncommitted  "
        (( ''${ahead:-0}  > 0 )) && msg+="↑$ahead unpushed  "
        (( ''${behind:-0} > 0 )) && msg+="↓$behind behind → run 'update'  "
        [ -n "$msg" ] && print -P "%F{yellow}❄ dotfiles:%f $msg"
      }

      # login greeting: a random pokemon piped in as the fastfetch logo
      if command -v fastfetch >/dev/null && command -v pokemon-colorscripts >/dev/null; then
        pokemon-colorscripts -r --no-title | fastfetch
      fi

      # nudge if the dotfiles repo has drifted (silent when in sync)
      _dotfiles_status
    '';
  };
}
