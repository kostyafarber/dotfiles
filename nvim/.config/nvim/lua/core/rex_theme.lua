-- Map the active Rex theme onto catppuccin's palette, so nvim inside Rex uses
-- Rex's colours while keeping catppuccin's plugin integrations.
--
-- Rex stores the chosen light/dark theme IDs in its macOS defaults, and ships
-- every theme (background, foreground, 16 ANSI colours) in a JSON file in the
-- app bundle. That file is 1.7MB, so the extracted palette is cached per theme.

local M = {}

local THEMES = "/Applications/Rex Beta.app/Contents/Resources/SuperUI_SuperDesignTokens.bundle/Contents/Resources/themes.json"
local CACHE = vim.fn.stdpath("cache") .. "/rex-theme"

local function defaults(key)
  local res = vim.system({ "defaults", "read", "com.superlogical.rex", key }, { text = true }):wait()
  return res.code == 0 and vim.trim(res.stdout) or nil
end

-- "light" or "dark", following Rex's own appearance setting.
function M.mode()
  local appearance = defaults("Workspace.appearance")
  if appearance == "light" or appearance == "dark" then return appearance end
  local res = vim.system({ "defaults", "read", "-g", "AppleInterfaceStyle" }, { text = true }):wait()
  return vim.trim(res.stdout or "") == "Dark" and "dark" or "light"
end

local function load_source(id)
  local stat = vim.uv.fs_stat(THEMES)
  if not stat then return nil end
  local cached = CACHE .. "/" .. id .. "-" .. stat.mtime.sec .. ".json"

  local f = io.open(cached, "r")
  if f then
    local ok, src = pcall(vim.json.decode, f:read("a"))
    f:close()
    if ok then return src end
  end

  f = io.open(THEMES, "r")
  if not f then return nil end
  local ok, themes = pcall(vim.json.decode, f:read("a"))
  f:close()
  if not ok then return nil end

  for _, t in ipairs(themes) do
    if t.id == id then
      local src = { background = t.source.background, foreground = t.source.foreground, ansi = t.source.ansi }
      vim.fn.mkdir(CACHE, "p")
      f = io.open(cached, "w")
      if f then f:write(vim.json.encode(src)); f:close() end
      return src
    end
  end
end

local function rgb(hex)
  return tonumber(hex:sub(2, 3), 16), tonumber(hex:sub(4, 5), 16), tonumber(hex:sub(6, 7), 16)
end

local function mix(a, b, t)
  local r1, g1, b1 = rgb(a)
  local r2, g2, b2 = rgb(b)
  local function c(x, y) return math.floor(x + (y - x) * t + 0.5) end
  return string.format("#%02x%02x%02x", c(r1, r2), c(g1, g2), c(b1, b2))
end

-- catppuccin color_overrides for the given mode, or nil outside a usable Rex.
function M.overrides(mode)
  local id = defaults(mode == "dark" and "Workspace.darkThemeID" or "Workspace.lightThemeID")
  local src = id and load_source(id)
  if not src then return nil end

  local bg, fg, a = src.background, src.foreground, src.ansi
  -- ANSI indices (1-based): 2 red, 3 green, 4 yellow, 5 blue, 6 magenta, 7 cyan; +8 bright.
  return {
    base = bg,
    mantle = mix(bg, fg, 0.04),
    crust = mix(bg, fg, 0.08),
    surface0 = mix(bg, fg, 0.12),
    surface1 = mix(bg, fg, 0.20),
    surface2 = mix(bg, fg, 0.28),
    overlay0 = mix(bg, fg, 0.38),
    overlay1 = mix(bg, fg, 0.46),
    overlay2 = mix(bg, fg, 0.54),
    subtext0 = mix(bg, fg, 0.66),
    subtext1 = mix(bg, fg, 0.80),
    text = fg,

    red = a[2],
    maroon = a[10],
    peach = mix(a[2], a[4], 0.5),
    yellow = a[4],
    green = a[3],
    teal = a[7],
    sky = a[15],
    sapphire = mix(a[5], a[7], 0.5),
    blue = a[5],
    lavender = a[13],
    mauve = a[6],
    pink = a[14],
    flamingo = mix(a[10], a[14], 0.5),
    rosewater = mix(a[10], bg, 0.3),
  }
end

return M
