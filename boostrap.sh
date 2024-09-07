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

echo "cloning dotfiles.."

git clone https://github.com/kostyafarber/dotfiles.git .dotfiles

