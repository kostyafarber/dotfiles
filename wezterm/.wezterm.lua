local wezterm = require("wezterm")

local config = wezterm.config_builder()
local mux = wezterm.mux

config.font = wezterm.font_with_fallback({
    "Berkeley Mono", "Hasklug Nerd Font Mono"
})

config.enable_tab_bar = false
config.default_prog = {
    "/bin/zsh", "-c", [[
    export PATH="/opt/homebrew/bin:$PATH"
    if ! command -v tmux &> /dev/null; then
        echo "tmux not found. Please install it using Homebrew."
        exec zsh
    elif ! tmux has-session -t main 2>/dev/null; then
        tmux new-session -s main
    elif ! tmux has-session -t "main 2" 2>/dev/null; then
        tmux new-session -s "main 2"
    else
        tmux attach-session -t main
    fi
    exec zsh
    ]]
}

config.color_scheme = "Dark Pastel (Gogh)"
config.window_background_opacity = 0.9
config.macos_window_background_blur = 10

config.default_cursor_style = "SteadyUnderline"

wezterm.on("gui-startup", function(cmd)
    local tab, pane, window = mux.spawn_window(cmd or {})
    window:gui_window():maximize()
end)

return config
