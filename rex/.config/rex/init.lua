-- Rex config. Mirrors the tmux setup in nix/home/common.nix: same C-Space
-- prefix and the same keys after it, for the bindings actually in use.

local shell = "com.superlogical.terminal.shell"
local terminal = "com.superlogical.terminal"

-- The directory of the terminal an action was run from, or nil.
local function block_cwd(block_id)
  if block_id == nil then return nil end
  local proc = rex.block.call(terminal, "process", { block_id = block_id })
  if proc == nil then return nil end
  if proc.foreground and proc.foreground.cwd then return proc.foreground.cwd end
  if proc.ancestors and proc.ancestors[1] then return proc.ancestors[1].cwd end
  return nil
end

local function term(cwd, command)
  return rex.layout.block{ flavor = shell, options = { cwd = cwd, command = command } }
end

-- Neovim on the left, Claude Code on the right.
local function code_claude_layout(cwd, ratio)
  return rex.layout.horizontal(ratio or 0.66, term(cwd, { "nvim" }), term(cwd, { "claude" }))
end

-- Actions ------------------------------------------------------------------

rex.action{
  name  = "code_claude",
  title = "Open Neovim + Claude",
  args  = { cwd = "string?", ratio = "number?" },
  run   = function(ctx, args)
    local cwd = args.cwd or block_cwd(ctx.block_id) or os.getenv("HOME")
    local w, err = rex.session.new_window{ layout = code_claude_layout(cwd, args.ratio) }
    if err ~= nil then error(err, 0) end
    return { window_id = w.window_id, cwd = cwd }
  end,
}

-- Switch to the project's session, creating it with the Neovim + Claude
-- layout the first time. The session is named after the directory.
rex.action{
  name  = "open_project",
  title = "Open Project",
  args  = { dir = "string" },
  run   = function(ctx, args)
    local dir = args.dir:gsub("/+$", "")
    local label = dir:match("([^/]+)$"):gsub("%.", "_")

    local list, err = rex.call("session.list")
    if err ~= nil then error(err, 0) end
    local session_id
    for _, s in ipairs(list.sessions or {}) do
      if s.label and s.label:lower() == label:lower() then session_id = s.session_id end
    end

    if session_id == nil then
      local created, cerr = rex.call("session.create", {
        label = label,
        initial_windows = { { window_label = "code", layout = code_claude_layout(dir) } },
      })
      if cerr ~= nil then error(cerr, 0) end
      session_id = created.session_id
    end

    rex.client.queue("session.select", { session_id = session_id })
    return { session_id = session_id, label = label }
  end,
}

-- One palette entry per project, so the command palette is the project picker.
-- Projects are read when the config loads: reload (prefix r) to pick up new ones.
local function project_dirs()
  local home = os.getenv("HOME")
  local dirs = { home .. "/.dotfiles" }
  -- rex.exec takes argv with no shell, so no glob: list with find instead.
  local res = rex.exec{ "find", "-L", home .. "/repos", "-mindepth", "1", "-maxdepth", "1", "-type", "d" }
  local out = res.stdout
  if res.ok and out then
    local repos = {}
    for line in out:gmatch("[^\n]+") do
      -- Skip dot dirs, which the old `repos/*/` glob never matched.
      if not line:match("/%.[^/]*$") then repos[#repos + 1] = line end
    end
    table.sort(repos)
    for _, d in ipairs(repos) do dirs[#dirs + 1] = d end
  end
  return dirs
end

for _, dir in ipairs(project_dirs()) do
  local name = dir:match("([^/]+)$")
  rex.action{
    name     = "project_" .. name:lower():gsub("[^a-z0-9]", "_"),
    title    = name,
    category = "Projects",
    keywords = "project open",
    run      = function(ctx, args)
      return rex.invoke("open_project", { dir = dir })
    end,
  }
end

-- tmux-dev-layout: editor 65% over a shell 35% on the left, 26% column on the right.
rex.action{
  name  = "dev_layout",
  title = "Open Dev Layout",
  args  = { cwd = "string?" },
  run   = function(ctx, args)
    local cwd = args.cwd or block_cwd(ctx.block_id) or os.getenv("HOME")
    local w, err = rex.session.new_window{
      layout = rex.layout.horizontal(0.74,
        rex.layout.vertical(0.65, term(cwd), term(cwd)),
        term(cwd)),
    }
    if err ~= nil then error(err, 0) end
    return { window_id = w.window_id, cwd = cwd }
  end,
}

-- A tab of its own, so nvim gets the whole window. Starts in the directory of
-- the pane the action ran from.
local function nvim_tab(ctx, label, command)
  local cwd = block_cwd(ctx.block_id) or os.getenv("HOME")
  local w, err = rex.session.new_window{ window_label = label, layout = term(cwd, command) }
  if err ~= nil then error(err, 0) end
  return { window_id = w.window_id, cwd = cwd }
end

-- Neovim in the current tab: split the pane the action ran from, nvim on the
-- left at the code_claude ratio, in that pane's directory.
rex.action{
  name     = "nvim_here",
  title    = "Neovim Here",
  keywords = "editor nvim vim split",
  run      = function(ctx)
    local cwd = block_cwd(ctx.block_id) or os.getenv("HOME")
    local res, err = rex.call("session.new_split", {
      session_id = ctx.session_id,
      anchor_id  = ctx.block_id,
      direction  = "horizontal",
      side       = "before",
      ratio      = 0.66,
      focus      = true,
      layout     = term(cwd, { "nvim" }),
    })
    if err ~= nil then error(err, 0) end
    return res
  end,
}

rex.action{
  name  = "nvim_tab",
  title = "Open Neovim in a New Tab",
  keywords = "editor nvim full",
  run   = function(ctx) return nvim_tab(ctx, "nvim", { "nvim" }) end,
}

-- review.nvim (nvim/.config/nvim/lua/plugins/nvim/review.lua): the working tree's
-- changes as a commentable, editable diff. <leader>vs sends the review to Claude.
rex.action{
  name  = "review_tab",
  title = "Review Changes",
  keywords = "review diff code nvim",
  run   = function(ctx) return nvim_tab(ctx, "review", { "nvim", "-c", "Review" }) end,
}

-- Keys ---------------------------------------------------------------------

local p = "ctrl+space>"

rex.bind(p .. "ctrl+space", "pane.send_key", { key = "ctrl+space" })

-- splits and panes
rex.bind(p .. "\\", "pane.split.right")
rex.bind(p .. "-", "pane.split.down")
-- Prefix h/j/k/l cross nvim splits too: when nvim is in the foreground, send it
-- alt+shift+<key>, which nvim maps to "move split, or `rex focus` at the edge"
-- (nvim/.config/nvim/lua/core/rex.lua).
local function foreground_is_nvim(block_id)
  if block_id == nil then return false end
  local proc = rex.block.call(terminal, "process", { block_id = block_id })
  local fg = proc and proc.foreground
  return fg ~= nil and (fg.name == "nvim" or fg.argv0 == "nvim")
end

local nav_keys = { left = "h", down = "j", up = "k", right = "l" }

-- An action, not a function binding: key handlers can't queue client actions.
rex.action{
  name  = "nav_focus",
  title = "Focus Pane (nvim-aware)",
  args  = { direction = "string" },
  run   = function(ctx, args)
    if foreground_is_nvim(ctx.block_id) then
      rex.client.queue("pane.send_key", { key = "alt+shift+" .. nav_keys[args.direction] })
    else
      rex.client.queue("pane.focus", { direction = args.direction })
    end
  end,
}

for dir, key in pairs(nav_keys) do
  rex.bind(p .. key, "nav_focus", { direction = dir })
  rex.bind("ctrl+" .. key, "nav_focus", { direction = dir }) -- no prefix, vim-tmux-navigator style
  rex.bind("cmd+alt+" .. dir, "nav_focus", { direction = dir }) -- arrows, iTerm style
end
rex.bind(p .. "z", "pane.zoom")

-- rearranging: shift+direction swaps the pane that way; ! breaks it out to its
-- own tab (tmux break-pane); m picks a tab to move it into
rex.bind(p .. "shift+h", "pane.move.left")
rex.bind(p .. "shift+j", "pane.move.down")
rex.bind(p .. "shift+k", "pane.move.up")
rex.bind(p .. "shift+l", "pane.move.right")
-- ...and the Mac (iTerm2/Ghostty) way: cmd+opt+arrows focuses, add shift to
-- carry the pane along; cmd+shift+enter zooms
for _, dir in ipairs{ "left", "down", "up", "right" } do
  rex.bind("cmd+alt+shift+" .. dir, "pane.move." .. dir)
end
rex.bind("cmd+shift+enter", "pane.zoom")
rex.bind(p .. "shift+1", "pane.move_to_new_tab")
rex.bind(p .. "m", "pane.move_to_tab")
rex.bind(p .. "=", "pane.balance")
rex.bind(p .. "x", "pane.close")

rex.bind("alt+up", "pane.resize", { direction = "up" })
rex.bind("alt+down", "pane.resize", { direction = "down" })
rex.bind("alt+left", "pane.resize", { direction = "left" })
rex.bind("alt+right", "pane.resize", { direction = "right" })

-- tabs (tmux windows)
rex.bind(p .. "n", "client.tab.next")
rex.bind(p .. "p", "client.tab.previous")
for i = 0, 9 do
  rex.bind(p .. i, "client.tab.goto", { index = i + 1 }) -- Rex counts tabs from 1; tmux here from 0
end

-- sessions
rex.bind(p .. "s", "session.switch")
rex.bind(p .. "f", "client.palette.toggle")

-- layouts
rex.bind(p .. "shift+d", "dev_layout")

-- misc
rex.bind(p .. "c>h", "com.superlogical.terminal.clear")
rex.bind(p .. "r", "client.config.reload")
