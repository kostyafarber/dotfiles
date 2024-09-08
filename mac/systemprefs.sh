#!/usr/bin/env bash

# dock settings
defaults write com.apple.dock persistent-apps -array 
defaults write com.apple.dock static-only -bool true
defaults write com.apple.dock show-recents -bool false

# Disable the “Are you sure you want to open this application?” dialog
defaults write com.apple.LaunchServices LSQuarantine -bool false

# Save screenshots to the desktop
defaults write com.apple.screencapture location -string "${HOME}/Desktop"

# Save screenshots in PNG format (other options: BMP, GIF, JPG, PDF, TIFF)
defaults write com.apple.screencapture type -string "png"

# Enable subpixel font rendering on non-Apple LCDs
defaults write NSGlobalDomain AppleFontSmoothing -int 2

# Finder: show all filename extensions
defaults write NSGlobalDomain AppleShowAllExtensions -bool true

# Finder: show status bar
defaults write com.apple.finder ShowStatusBar -bool true

# Finder: show path bar
defaults write com.apple.finder ShowPathbar -bool true

# Display full POSIX path as Finder window title
defaults write com.apple.finder _FXShowPosixPathInTitle -bool true

# Keep folders on top when sorting by name
defaults write com.apple.finder _FXSortFoldersFirst -bool true

# When performing a search, search the current folder by default
defaults write com.apple.finder FXDefaultSearchScope -string "SCcf"

# Automatically hide and show the Dock
defaults write com.apple.dock autohide -bool true

# Disable the “Are you sure you want to open this application?” dialog
defaults write com.apple.LaunchServices LSQuarantine -bool false

# set chrome as deafult browser
defaultbrowser chrome

# remapping caps lock to escape
mkdir -p $HOME/Library/LaunchAgents
cp $HOME/.dotfiles/mac/keybindings/com.user.remapkeys.plist $HOME/Library/LaunchAgents
chmod 644 $HOME/Library/LaunchAgents/com.user.remapkeys.plist
launchctl load ~/Library/LaunchAgents/com.user.remapkeys.plist

# make it available immediately
hidutil property --set '{"UserKeyMapping":[{"HIDKeyboardModifierMappingSrc":0x700000039,"HIDKeyboardModifierMappingDst":0x700000029}]}'



