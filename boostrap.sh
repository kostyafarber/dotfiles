#!/usr/bin/env bash

# Helper functions
command_exists() {
    command -v "$1" &> /dev/null
}

dir_exists() {
    [ -d "$1" ]
}

file_exists() {
    [ -f "$1" ]
}

cat << "EOF"
    ____              __       __                 
   / __ )____  ____  / /______/ /__________ _____ 
  / __  / __ \/ __ \/ __/ ___/ __/ ___/ __ `/ __ \
 / /_/ / /_/ / /_/ / /_(__  ) /_/ /  / /_/ / /_/ /
/_____/\____/\____/\__/____/\__/_/   \__,_/ .___/ 
                                         /_/      
EOF

sleep 2

printf '\033[1J'

echo "boostrapping system..." 

# Check and install brew
if ! command_exists brew; then
    echo "installing brew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
else
    echo "brew already installed, skipping..."
fi

# Check and install oh-my-zsh
if ! dir_exists "$HOME/.oh-my-zsh"; then
    echo "installing oh-my-zsh..."
    sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
else
    echo "oh-my-zsh already installed, skipping..."
fi

# Check and install zsh-autosuggestions
if ! dir_exists "${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/plugins/zsh-autosuggestions"; then
    echo "installing zsh-autosuggestions..."
    git clone https://github.com/zsh-users/zsh-autosuggestions ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-autosuggestions
else
    echo "zsh-autosuggestions already installed, skipping..."
fi

# Check and install nvm
if ! dir_exists "$HOME/.nvm"; then
    echo "installing nvm..."
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
    # Source nvm for current session
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    nvm install --lts
else
    echo "nvm already installed, skipping..."
    # Still check if Node.js is installed
    if ! command_exists node; then
        echo "installing Node.js LTS..."
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
        nvm install --lts
    fi
fi

# Check and clone dotfiles
if ! dir_exists ".dotfiles"; then
    echo "cloning dotfiles..."
    git clone https://github.com/kostyafarber/dotfiles.git .dotfiles
else
    echo "dotfiles already cloned, skipping..."
fi

echo "installing brew packages..."
/opt/homebrew/bin/brew bundle install --file="$HOME/.dotfiles/mac/essential/Brewfile"

# Check and copy ascii file
if ! file_exists "$HOME/.ascii_castle.txt"; then
    cp .ascii_castle.txt $HOME/
else
    echo ".ascii_castle.txt already exists in home directory, skipping..."
fi

echo "installing dotfiles..."
cd .dotfiles

# overwrite and restore the dotfiles
/opt/homebrew/bin/stow nvim tmux wezterm zshrc
/opt/homebrew/bin/stow --no-folding vscode
git restore .

echo "setting mac preferences..."
chmod +x $HOME/.dotfiles/mac/system/preferences.sh
$HOME/.dotfiles/mac/system/preferences.sh



