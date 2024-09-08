#!/usr/bin/env bash

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

echo "installing brew..."

/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

echo "installing oh-my-zsh..."
sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"

echo "installing zsh-autosuggestions..."
git clone https://github.com/zsh-users/zsh-autosuggestions ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-autosuggestions

echo "installing nvm..."
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

echo "cloning dotfiles.."
git clone https://github.com/kostyafarber/dotfiles.git .dotfiles

echo "installing brew packages..."

# add brew to the path 
export PATH="/opt/homebrew/bin:$PATH"

brew bundle install --file="$HOME/.dotfiles/mac/essential/Brewfile"

cp .ascii_castle.txt $HOME/

echo "installing dotfiles..."
cd .dotfiles

# overwrite and restore the dotfiles
stow nvim tmux wezterm zshrc
stow --adopt --no-folding vscode
git restore .

echo "setting mac preferences..."
chmod +x $HOME/.dotfiles/mac/systemprefs.sh
$HOME/.dotfiles/mac/systemprefs.sh



