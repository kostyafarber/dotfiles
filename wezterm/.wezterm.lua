-- Pull in the wezterm API
local wezterm = require('wezterm')

-- This will hold the configuration.
local config = wezterm.config_builder()
local mux = wezterm.mux

-- This is where you actually apply your config choices

-- For example, changing the color scheme:
config.font = wezterm.font_with_fallback {
  'Berkeley Mono',
  'Hasklug Nerd Font',
}

config.enable_tab_bar = false

config.color_scheme = 'Dark Pastel (Gogh)'
config.window_background_opacity = 0.9
config.macos_window_background_blur = 10

config.default_cursor_style = 'SteadyUnderline'

wezterm.on('gui-startup', function(cmd)
  local tab, pane, window = mux.spawn_window(cmd or {})
  window:gui_window():maximize()
end)

-- and finally, return the configuration to wezterm
return config
