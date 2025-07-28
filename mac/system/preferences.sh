#!/usr/bin/env bash

set -e  # Exit on any error

# Get the directory where this script is located (your dotfiles root)
DOTFILES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🍎 Setting up macOS preferences..."
echo "📁 Dotfiles directory: $DOTFILES_DIR"

# Dock settings
echo "⚙️  Configuring Dock..."
defaults write com.apple.dock persistent-apps -array
defaults write com.apple.dock static-only -bool true
defaults write com.apple.dock show-recents -bool false
defaults write com.apple.dock autohide -bool true

# Security settings
echo "🔒 Configuring security settings..."
defaults write com.apple.LaunchServices LSQuarantine -bool false

# Screenshot settings
echo "📸 Configuring screenshot settings..."
defaults write com.apple.screencapture location -string "${HOME}/Desktop"
defaults write com.apple.screencapture type -string "png"

# Font rendering
echo "🖥️  Configuring display settings..."
defaults write NSGlobalDomain AppleFontSmoothing -int 2

# Finder settings
echo "📁 Configuring Finder..."
defaults write NSGlobalDomain AppleShowAllExtensions -bool true
defaults write com.apple.finder ShowStatusBar -bool true
defaults write com.apple.finder ShowPathbar -bool true
defaults write com.apple.finder _FXShowPosixPathInTitle -bool true
defaults write com.apple.finder _FXSortFoldersFirst -bool true
defaults write com.apple.finder FXDefaultSearchScope -string "SCcf"

# Set default browser
echo "🌐 Setting Chrome as default browser..."
if command -v /opt/homebrew/bin/defaultbrowser &> /dev/null; then
    /opt/homebrew/bin/defaultbrowser chrome
else
    echo "⚠️  defaultbrowser not found at /opt/homebrew/bin/defaultbrowser"
    echo "   You may need to install it with: brew install defaultbrowser"
fi

# Key remapping setup
echo "⌨️  Setting up key remapping (Caps Lock -> Escape)..."

# Clean up any existing service first
launchctl bootout gui/$(id -u)/com.user.remapkeys 2>/dev/null || true
launchctl disable gui/$(id -u)/com.user.remapkeys 2>/dev/null || true

# Set up the launch agent
mkdir -p "$HOME/Library/LaunchAgents"

if [[ -f "$DOTFILES_DIR/mac/keybindings/com.user.remapkeys.plist" ]]; then
    cp "$DOTFILES_DIR/mac/keybindings/com.user.remapkeys.plist" "$HOME/Library/LaunchAgents/"
    chmod 644 "$HOME/Library/LaunchAgents/com.user.remapkeys.plist"
    
    # Bootstrap and enable the service
    if launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.user.remapkeys.plist; then
        echo "✅ LaunchAgent bootstrapped successfully"
        
        if launchctl enable gui/$(id -u)/com.user.remapkeys; then
            echo "✅ LaunchAgent enabled successfully"
        else
            echo "⚠️  Failed to enable LaunchAgent, but key remapping will still work"
        fi
    else
        echo "❌ Failed to bootstrap LaunchAgent"
        echo "   Key remapping will only work for the current session"
        echo "   You may need to run this manually after each restart"
    fi
else
    echo "❌ Plist file not found at $DOTFILES_DIR/mac/keybindings/com.user.remapkeys.plist"
    echo "   Skipping LaunchAgent setup"
    
    # Apply the key mapping immediately anyway
    hidutil property --set '{"UserKeyMapping":[{"HIDKeyboardModifierMappingSrc":0x700000039,"HIDKeyboardModifierMappingDst":0x700000029}]}'
    echo "⌨️  Key remapping applied for current session only"
fi

# Apply the key mapping immediately
echo "⌨️  Applying key remapping for current session..."
hidutil property --set '{"UserKeyMapping":[{"HIDKeyboardModifierMappingSrc":0x700000039,"HIDKeyboardModifierMappingDst":0x700000029}]}'

# Verify the key mapping
if hidutil property --get "UserKeyMapping" | grep -q "0x700000039"; then
    echo "✅ Key remapping verified: Caps Lock -> Escape"
else
    echo "⚠️  Key remapping may not have applied correctly"
fi

# Restart Dock to apply changes
echo "🔄 Restarting Dock..."
killall Dock

echo "🎉 macOS setup complete!"
echo ""
echo "Changes applied:"
echo "  • Dock configured (hidden, no recent apps)"
echo "  • Finder enhanced (extensions, status bar, path bar)"
echo "  • Screenshots saved to Desktop as PNG"
echo "  • Caps Lock mapped to Escape"
echo "  • Chrome set as default browser (if installed)"
echo ""
echo "Note: Some changes may require a logout/login to take full effect."