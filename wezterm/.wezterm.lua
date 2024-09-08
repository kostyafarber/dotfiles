local wezterm = require('wezterm')

local config = wezterm.config_builder()
local mux = wezterm.mux

config.font = wezterm.font_with_fallback {
  'Berkeley Mono',
  'Hasklug Nerd Font',
}

config.enable_tab_bar = false

config.color_scheme = 'Dark Pastel (Gogh)'
config.window_background_opacity = 0.9
config.macos_window_background_blur = 10

config.default_cursor_style = 'SteadyUnderline'

config.default_prog = { '/opt/homebrew/bin/tmux', 'new-session', '-A', '-s', 'main' }


wezterm.on('gui-startup', function(cmd)
  local tab, pane, window = mux.spawn_window(cmd or {})
  window:gui_window():maximize()
end)

return config
