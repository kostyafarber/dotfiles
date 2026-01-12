# Dotfiles

A collection of my dotfiles for macOS, managed via GNU Stow. All configuration is version-controlled and automatically symlinked to the correct locations.

## Quick Start

Run the bootstrap script on a fresh machine:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/kostyafarber/dotfiles/main/bootstrap.sh)"
```

The script will:
- Install Homebrew and essential packages (via Brewfile)
- Install oh-my-zsh and plugins
- Install nvm and Node.js
- Set up all dotfiles using Stow
- Configure macOS system preferences

## Packages

- **nvim** - Neovim editor configuration with keybindings and plugins
- **tmux** - Terminal multiplexer configuration with custom keybindings
- **zshrc** - Zsh shell configuration with aliases and functions
- **vscode** - Visual Studio Code settings and keybindings
- **wezterm** - WezTerm terminal configuration
- **fastfetch** - System information display configuration
- **lazygit** - Git UI configuration
- **claude-code** - Claude Code CLI settings (model selection, permissions, notification hooks)
- **mac** - macOS-specific configurations (Brewfile, system preferences, keybindings)

## Claude Code Settings

Claude Code settings are tracked in `claude-code/.claude/`:
- `settings.json` - Core preferences (model selection, notification hooks)
- `settings.local.json` - Tool permissions and allow/deny lists

These files are symlinked to `~/.claude/` via Stow. When you modify settings in Claude Code, the changes automatically appear in the dotfiles repo. Simply commit and push to sync across machines.

The rest of Claude Code's cache (debug logs, project sessions, history) remains local and untracked.

## Managing Brewfile

Your installed packages are tracked in `mac/essential/Brewfile`. To update it after installing new packages:

```bash
brew bundle dump --file="$HOME/.dotfiles/mac/essential/Brewfile" --force
cd ~/.dotfiles
git add mac/essential/Brewfile
git commit -m "Update Brewfile with new packages"
git push
```

This ensures your package list syncs across machines.

```yml
                  ____________________________________ 
                 / Welcome to my dotfiles, venture no \
                 \ further!                           /
                  ------------------------------------ 
                       \                    / \  //\
                        \    |\___/|      /   \//  \\
                             /0  0  \__  /    //  | \ \    
                            /     /  \/_/    //   |  \  \  
                            @_^_@'/   \/_   //    |   \   \ 
                            //_^_/     \/_ //     |    \    \
                         ( //) |        \///      |     \     \
                       ( / /) _|_ /   )  //       |      \     _\
                     ( // /) '/,_ _ _/  ( ; -.    |    _ _\.-~        .-~~~^-.
                   (( / / )) ,-{        _      `-.|.-~-.           .~         `.
                  (( // / ))  '/\      /                 ~-. _ .-~      .-~^-.  \
                  (( /// ))      `.   {            }                   /      \  \
                   (( / ))     .----~-.\        \-'                 .~         \  `. \^-.
                              ///.----..>        \             _ -~             `.  ^-`  ^-_
                                ///-._ _ _ _ _ _ _}^ - - - - ~                     ~-- ,.-~
                                                                                   /.-~

``` 
