if [ -f $HOME/.secrets ]; then
  source $HOME/.secrets
fi

export PATH=$HOME/.bin:$HOME/bin:/usr/local/bin:$PATH
export PATH="/opt/homebrew/opt/make/libexec/gnubin:$PATH"

zmodload zsh/zprof
eval "$(/opt/homebrew/bin/brew shellenv)"


# Path to your oh-my-zsh installation.
export ZSH="$HOME/.oh-my-zsh"
export FZF_DEFAULT_OPTS=" \
--color=bg+:#ccd0da,bg:#eff1f5,spinner:#dc8a78,hl:#d20f39 \
--color=fg:#4c4f69,header:#d20f39,info:#8839ef,pointer:#dc8a78 \
--color=marker:#dc8a78,fg+:#4c4f69,prompt:#8839ef,hl+:#d20f39 \
--color=selected-bg:#bcc0cc \
--color=border:#ccd0da,label:#4c4f69"
export XDG_CONFIG_HOME="$HOME/.config"
# Set name of the theme to load --- if set to "random", it will
# load a random theme each time oh-my-zsh is loaded, in which case,
# to know which specific one was loaded, run: echo $RANDOM_THEME
# See https://github.com/ohmyzsh/ohmyzsh/wiki/Themes
# ZSH_THEME="robbyrussell"

# Set list of themes to pick from when loading at random
# Setting this variable when ZSH_THEME=random will cause zsh to load
# a theme from this variable instead of looking in $ZSH/themes/
# If set to an empty array, this variable will have no effect.
# ZSH_THEME_RANDOM_CANDIDATES=( "robbyrussell" "agnoster" )

# Uncomment the following line to use case-sensitive completion.
# CASE_SENSITIVE="true"

# Uncomment the following line to use hyphen-insensitive completion.
# Case-sensitive completion must be off. _ and - will be interchangeable.
# HYPHEN_INSENSITIVE="true"

# Uncomment one of the following lines to change the auto-update behavior
# zstyle ':omz:update' mode disabled  # disable automatic updates
# zstyle ':omz:update' mode auto      # update automatically without asking
zstyle ':omz:update' mode reminder  # just remind me to update when it's time

# Uncomment the following line to change how often to auto-update (in days).
# zstyle ':omz:update' frequency 13

# Uncomment the following line if pasting URLs and other text is messed up.
# DISABLE_MAGIC_FUNCTIONS="true"


# Uncomment the following line to disable colors in ls.
# DISABLE_LS_COLORS="true"

# Uncomment the following line to disable auto-setting terminal title.
# DISABLE_AUTO_TITLE="true"

# Uncomment the following line to enable command auto-correction.
# ENABLE_CORRECTION="true"

# Uncomment the following line to display red dots whilst waiting for completion.
# You can also set mt to another string to have that shown instead of the default red dots.
# e.g. COMPLETION_WAITING_DOTS="%F{yellow}wa/ting...%f"
# Caution: this setting can cause issues with multiline prompts in zsh < 5.7.1 (see #5765)
# COMPLETION_WAITING_DOTS="true"

# Uncomment the following line if you want to disable marking untracked files
# under VCS as dirty. This makes repository status check for large repositories
# much, much faster.
# DISABLE_UNTRACKED_FILES_DIRTY="true"

# Uncomment the following line if you want to change the command execution time
# stamp shown in the history command output.
# You can set one of the optional three formats:
# "mm/dd/yyyy"|"dd.mm.yyyy"|"yyyy-mm-dd"
# or set a custom format using the strftime function format specifications,
# see 'man strftime' for details.
# HIST_STAMPS="mm/dd/yyyy"

# Would you like to use another custom folder than $ZSH/custom?
# ZSH_CUSTOM=/path/to/new-custom-folder

# Which plugins would you like to load?
# Standard plugins can be found in $ZSH/plugins/
# Custom plugins may be added to $ZSH_CUSTOM/plugins/
# Example format: plugins=(rails git textmate ruby lighthouse)
# Add wisely, as too many plugins slow down shell startup.

plugins=(
        zsh-autosuggestions
        z
)

fpath+=$HOME/.oh-my-zsh/custom/plugins/conda-zsh-completion

source $ZSH/oh-my-zsh.sh

# User configuration
autoload -U compinit && compinit


# export MANPATH="/usr/local/man:$MANPATH"

# You may need to manually set your language environment
# export LANG=en_US.UTF-8

# Preferred editor for local and remote sessions
if [[ -n $SSH_CONNECTION ]]; then
  export EDITOR='vim'
else
  export EDITOR='nvim'
fi

# Compilation flags
# export ARCHFLAGS="-arch x86_64"

# Set personal aliases, overriding those provided by oh-my-zsh libs,
# plugins, and themes. Aliases can be placed here, though oh-my-zsh
# users are encouraged to define aliases within the ZSH_CUSTOM folder.
# For a full list of active aliases, run `alias`.
#
# Example aliases
# alias zshconfig="mate ~/.zshrc"
# alias ohmyzsh="mate ~/.oh-my-zsh"

# set vim keybindings in terminal
set -o vi

# system
alias drc="nvim $HOME/.dotfiles"
alias nrd='npm run dev'
alias src=". $HOME/.zshrc"
alias vrc='nvim $HOME/.zshrc'
alias crc='nvim $HOME/.claude'
alias salias='alias | fzf --preview 'echo {}' --preview-window=up:3:wrap'

tempe () {
  cd "$(mktemp -d)"
  chmod -R 0700 .
  if [[ $# -eq 1 ]]; then
    \mkdir -p "$1"
    cd "$1"
    chmod -R 0700 .
  fi
}

alias e='exit'
alias c='claude'
alias cs='claude --dangerously-skip-permissions'
alias csf='claude --dangerously-skip-permissions --model haiku'

# git
alias lg='lazygit'
alias gc='git commit'
alias grh='git reset HEAD~1'
alias gcr='git commit --reuse-message=ORIG_HEAD'
alias gca='git commit --amend'
alias gcan='git commit --amend --no-verify'
alias gta='git add .'
alias gpo='git push origin'
alias gpof='git push origin --force'
alias gt='git status'
alias gp='git pull'
alias gl='git log'

alias gcm='git checkout main'

alias gb="git stash && git pull && git stash pop"
alias gs='git stash'
alias gtp='git stash pop'
alias gsu="git pull upstream master && git push origin"

dot-sync() {
  local dir="$HOME/.dotfiles"
  if [ ! -d "$dir/.git" ]; then
    echo "dot-sync: $dir is not a git repo" >&2
    return 1
  fi
  local dirty=0
  if ! git -C "$dir" diff --quiet || ! git -C "$dir" diff --cached --quiet; then
    dirty=1
    echo "dot-sync: stashing local changes..."
    git -C "$dir" stash push -u -m "dot-sync auto-stash" || return 1
  fi
  echo "dot-sync: pulling..."
  if ! git -C "$dir" pull --rebase --autostash; then
    echo "dot-sync: pull failed" >&2
    [ "$dirty" -eq 1 ] && echo "dot-sync: your stash is still saved (git -C $dir stash list)"
    return 1
  fi
  if [ "$dirty" -eq 1 ]; then
    echo "dot-sync: popping stash..."
    git -C "$dir" stash pop || {
      echo "dot-sync: stash pop had conflicts — resolve in $dir" >&2
      return 1
    }
  fi
  echo "dot-sync: done"
}

gco() {
    local branch=$(git branch -a --format='%(refname:short)' --sort=-committerdate | \
        grep -v '^HEAD$' | \
        fzf --exact --ansi \
            --preview 'git log --oneline --color -n 5 {} && echo "" && git diff --stat --color HEAD...{} 2>/dev/null' \
            --preview-window=right:60%)
    
    if [ -n "$branch" ]; then
        branch="${branch#origin/}"
        git checkout "$branch"
    fi
}

# ladybird
alias lc="./Meta/ladybird.sh delete"
alias lr="CC=$(brew --prefix llvm)/bin/clang CXX=$(brew --prefix llvm)/bin/clang++ ./Meta/ladybird.sh run ladybird"
alias lrd="CC=$(brew --prefix llvm)/bin/clang CXX=$(brew --prefix llvm)/bin/clang++ BUILD_PRESET=Debug ./Meta/ladybird.sh run ladybird"
alias lt="cmake --preset default && cmake --build --preset default && ctest --preset default"
alias lts='cmake --preset Sanitizer && cmake --build --preset Sanitizer && ctest --preset Sanitizer'
alias lqon='cmake --preset default -DENABLE_QT=ON'
alias lqoff='cmake --preset default -DENABLE_QT=OFF'

# fzf key bindings and completion
source <(fzf --zsh)

# Ctrl-O: fzf-pick a project from ~/repos and open it (via tms)
bindkey -M viins -s '^O' '^Utms^M'
bindkey -M vicmd -s '^O' '^Utms^M'
eval "$(oh-my-posh init zsh --config $(brew --prefix oh-my-posh)/themes/agnoster.omp.json)"

export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion

# >>> conda initialize >>>
# !! Contents within this block are managed by 'conda init' !!
__conda_setup="$('/opt/homebrew/Caskroom/miniconda/base/bin/conda' 'shell.zsh' 'hook' 2> /dev/null)"
if [ $? -eq 0 ]; then
    eval "$__conda_setup"
else
    if [ -f "/opt/homebrew/Caskroom/miniconda/base/etc/profile.d/conda.sh" ]; then
        . "/opt/homebrew/Caskroom/miniconda/base/etc/profile.d/conda.sh"
    else
        export PATH="/opt/homebrew/Caskroom/miniconda/base/bin:$PATH"
    fi
fi
unset __conda_setup
# <<< conda initialize <<<

# place this after nvm initialization!
autoload -U add-zsh-hook
load-nvmrc() {
    local node_version="$(nvm version)"
    local nvmrc_path="$(nvm_find_nvmrc)"

    if [ -n "$nvmrc_path" ]; then
    local nvmrc_node_version=$(nvm version "$(cat "${nvmrc_path}")")

    if [ "$nvmrc_node_version" = "N/A" ]; then
      nvm install
    elif [ "$nvmrc_node_version" != "$node_version" ]; then
      nvm use
    fi
    elif [ "$node_version" != "$(nvm version default)" ]; then
    echo "Reverting to nvm default version"
    nvm use default
    fi
}
add-zsh-hook chpwd load-nvmrc
load-nvmrc

export PATH="/opt/homebrew/opt/grep/libexec/gnubin:$PATH"

# don't know why putting my work file here applies the keybindings correctly
if [ -f $HOME/.work ]; then
 source $HOME/.work
fi

pokemon-colorscripts -r --no-title | fastfetch

[ -f "/Users/kostyafarber/.ghcup/env" ] && . "/Users/kostyafarber/.ghcup/env" # ghcup-env

# pnpm
export PNPM_HOME="/Users/kostyafarber/Library/pnpm"
case ":$PATH:" in
  *":$PNPM_HOME:"*) ;;
  *) export PATH="$PNPM_HOME:$PATH" ;;
esac
# pnpm end

export PATH="$HOME/.local/bin:$PATH"


# tmux-sessionizer: Ctrl+F in plain shell to fuzzy-pick a project
bindkey -s "^F" "tmux-sessionizer
"
