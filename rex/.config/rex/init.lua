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

-- Open a shell in a project in a new tab of a session (the current one by
-- default). The tab is named after the directory.
rex.action{
  name  = "project_tab",
  title = "Open Project in Tab",
  args  = { dir = "string", session_id = "string?" },
  run   = function(ctx, args)
    local dir = args.dir:gsub("/+$", "")
    local session_id = args.session_id or ctx.session_id
    local w, err = rex.call("session.new_window", {
      session_id   = session_id,
      window_label = dir:match("([^/]+)$"),
      layout       = term(dir),
      focus        = true,
    })
    if err ~= nil then error(err, 0) end
    -- The app keeps showing the old tab until it is told to select the new one.
    rex.client.queue("session.select", { session_id = session_id, window_id = w.window_id })
    return { window_id = w.window_id, dir = dir }
  end,
}

-- fzf over ~/repos in a floating pane; the pick opens in a new tab and the
-- pane closes when rex-sessionizer exits.
rex.action{
  name     = "project_picker",
  title    = "Pick Project (New Tab)",
  keywords = "project open fzf sessionizer tab",
  run      = function(ctx)
    local bin = os.getenv("HOME") .. "/.local/bin/rex-sessionizer"
    local res, err = rex.call("session.new_layer", {
      session_id = ctx.session_id,
      bounds     = { 0.2, 0.15, 0.6, 0.6 },
      focus      = true,
      layout     = term(os.getenv("HOME"), { bin, "--tab", ctx.session_id }),
    })
    if err ~= nil then error(err, 0) end
    return res
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
-- The Claude Code session running in this pane. Claude records each running
-- session in ~/.claude/sessions/<pid>.json.
local function pane_claude(ctx)
  local proc = ctx.block_id and rex.block.call(terminal, "process", { block_id = ctx.block_id })
  local fg = proc and proc.foreground
  local f = fg and io.open(os.getenv("HOME") .. "/.claude/sessions/" .. fg.pid .. ".json")
  if f == nil then error("no Claude Code session in this pane", 0) end
  local s = rex.json.decode(f:read("*a"))
  f:close()
  return s
end

-- Open a layout in a new pane below the one the action ran from, or in a new tab.
local function open_at(ctx, where, layout)
  local res, err
  if where == "tab" then
    res, err = rex.session.new_window{ window_label = "claude", layout = layout }
    -- The server makes the new window active, but the app keeps showing the
    -- old tab until it is told to select the new one.
    if err == nil then
      rex.client.queue("session.select", { session_id = ctx.session_id, window_id = res.window_id })
    end
  else
    res, err = rex.call("session.new_split", {
      session_id = ctx.session_id,
      anchor_id  = ctx.block_id,
      direction  = "vertical",
      side       = "after",
      focus      = true,
      layout     = layout,
    })
  end
  if err ~= nil then error(err, 0) end
  return res
end

-- New Session / Fork Session, each in a pane below (new_claude, fork_claude) or
-- in a new tab (new_claude_tab, fork_claude_tab). New starts in this pane's
-- directory; Fork is like the /fork-pane mod but without touching the prompt.
local wheres = {
  { where = "below", suffix = "",     title = " Below" },
  { where = "tab",   suffix = "_tab", title = " in Tab" },
}

for _, w in ipairs(wheres) do
  rex.action{
    name     = "new_claude" .. w.suffix,
    title    = "New Claude Code" .. w.title,
    category = "Claude",
    keywords = "claude code new session " .. w.where,
    run      = function(ctx)
      local cwd = block_cwd(ctx.block_id) or os.getenv("HOME")
      return open_at(ctx, w.where, term(cwd, { "claude" }))
    end,
  }
end

for _, w in ipairs(wheres) do
  rex.action{
    name     = "fork_claude" .. w.suffix,
    title    = "Fork Claude Code" .. w.title,
    category = "Claude",
    keywords = "claude code fork session " .. w.where,
    run      = function(ctx)
      local s = pane_claude(ctx)
      return open_at(ctx, w.where, term(s.cwd, { "claude", "--resume", s.sessionId, "--fork-session" }))
    end,
  }
end

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

-- A Shift PR in a "PR #…" tab of this session: review.nvim on the PR's branch (edit in
-- place) beside Claude, and with run=true the dev app building underneath. Opening another
-- PR replaces that tab; shift-review refuses while the worktree has uncommitted changes.
local shift_review_bin = os.getenv("HOME") .. "/.dotfiles/rex/.local/bin/shift-review"

rex.action{
  name     = "shift_review",
  title    = "Review Shift PR",
  keywords = "shift pr pull request review github",
  args     = { pr = "string", run = "boolean?" },
  run      = function(ctx, args)
    local res = rex.exec{ shift_review_bin, "checkout", args.pr }
    if not res.ok then error(res.stderr or res.stdout or "shift-review checkout failed", 0) end
    local pr = {}
    for key, value in (res.stdout or ""):gmatch("(%w+)=([^\n]*)") do pr[key] = value end

    local review = term(pr.dir, { "nvim", "-c", "Review branch " .. pr.branch .. " " .. pr.base })
    local layout = rex.layout.horizontal(0.66, review, term(pr.dir, { "claude" }))
    if args.run then
      layout = rex.layout.vertical(0.72, layout, term(pr.dir, { shift_review_bin, "app", pr.dir }))
    end

    local session_id = ctx.session_id
    local view, verr = rex.call("session.view", { session_id = session_id })
    if verr ~= nil then error(verr, 0) end
    local created, werr = rex.call("session.new_window", {
      session_id = session_id,
      window_label = "PR #" .. pr.number .. " " .. pr.title,
      layout = layout,
    })
    if werr ~= nil then error(werr, 0) end
    for _, w in ipairs(view.windows or {}) do
      if (w.window_label or w.label or ""):match("^PR #") then
        rex.call("session.close_window", { session_id = session_id, window_id = w.window_id })
      end
    end
    return { window_id = created.window_id, dir = pr.dir, branch = pr.branch }
  end,
}

-- Open Shift PRs in a floating picker over this tab (shift-review pick).
rex.action{
  name     = "shift_prs",
  title    = "Shift PRs",
  keywords = "shift pr pull request review github",
  run      = function(ctx)
    local res, err = rex.call("session.new_layer", {
      session_id = ctx.session_id,
      bounds     = { 0.06, 0.08, 0.88, 0.84 },
      focus      = true,
      layout     = term(os.getenv("HOME"), { shift_review_bin, "pick" }),
    })
    if err ~= nil then error(err, 0) end
    return res
  end,
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
end
rex.bind(p .. "z", "pane.zoom")

-- rearranging: shift+direction swaps the pane that way; ! breaks it out to its
-- own tab (tmux break-pane); m picks a tab to move it into
rex.bind(p .. "shift+h", "pane.move.left")
rex.bind(p .. "shift+j", "pane.move.down")
rex.bind(p .. "shift+k", "pane.move.up")
rex.bind(p .. "shift+l", "pane.move.right")
-- Rectangle-style snap: the focused pane takes that half of the tab and the
-- rest share the other half. pane.move only swaps with a neighbour that way,
-- so it can't turn a top/bottom stack into left/right.
local snap_split = {
  left  = { direction = "horizontal", side = "before" },
  right = { direction = "horizontal", side = "after" },
  up    = { direction = "vertical",   side = "before" },
  down  = { direction = "vertical",   side = "after" },
}

local function tiled_leaves(node, out)
  if node.block_id then
    out[#out + 1] = node
  elseif node.split then
    tiled_leaves(node.split.before, out)
    tiled_leaves(node.split.after, out)
  end
  return out
end

rex.action{
  name  = "snap",
  title = "Snap Pane to Half",
  args  = { direction = "string" },
  run   = function(ctx, args)
    local placement = snap_split[args.direction]
    if placement == nil or ctx.block_id == nil then return end
    local view, err = rex.call("session.view", { session_id = ctx.session_id })
    if err ~= nil then error(err, 0) end
    for _, w in ipairs(view.windows) do
      for _, layer in ipairs(w.layers) do
        if layer.kind == "tiled" then
          local leaves = tiled_leaves(layer.layout, {})
          local anchor, area = nil, -1
          local mine = false
          for _, leaf in ipairs(leaves) do
            if leaf.block_id == ctx.block_id then
              mine = true
            else
              local a = leaf.rect[3] * leaf.rect[4]
              if a > area then anchor, area = leaf.block_id, a end
            end
          end
          if mine then
            if anchor == nil then return end
            local _, merr = rex.call("session.move_block", {
              session_id      = ctx.session_id,
              block_id        = ctx.block_id,
              anchor_block_id = anchor,
              direction       = placement.direction,
              side            = placement.side,
              ratio           = 0.5,
            })
            if merr ~= nil then error(merr, 0) end
            rex.call("session.focus_block", { session_id = ctx.session_id, block_id = ctx.block_id })
            return
          end
        end
      end
    end
  end,
}

-- cmd+opt+arrows snap the pane to that half (Rectangle's arrows; ctrl+hjkl
-- moves focus); add shift to swap with the neighbour; cmd+shift+enter zooms
for _, dir in ipairs{ "left", "down", "up", "right" } do
  rex.bind("cmd+alt+" .. dir, "snap", { direction = dir })
  rex.bind("cmd+alt+shift+" .. dir, "pane.move." .. dir)
end
rex.bind("cmd+shift+enter", "pane.zoom")
-- Claude panes (also in the palette's Claude group): new session / fork this one,
-- both below. Not alt+c: zsh's fzf-cd-widget has it.
rex.bind("cmd+shift+c", "new_claude")
rex.bind("cmd+alt+c", "fork_claude")
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
rex.bind(p .. "g", "shift_prs")
rex.bind("cmd+shift+f", "project_picker")

-- journal: today's entry (zshrc/bin/journal) in its own tab with the
-- sidebar hidden. If today's entry is already open, bring it forward
-- instead. Old days' journals are left alone so unsaved writing is never closed.
rex.action{
  name  = "journal",
  title = "Open Today's Journal",
  run   = function(ctx)
    local label = "journal " .. os.date("%Y-%m-%d")
    local view, verr = rex.call("session.view", { session_id = ctx.session_id })
    if verr ~= nil then error(verr, 0) end

    for _, w in ipairs(view.windows or {}) do
      if (w.window_label or w.label) == label then
        rex.call("session.focus_window", { session_id = ctx.session_id, window_id = w.window_id })
        -- The app keeps showing the old tab until it is told to select this one.
        rex.client.queue("session.select", { session_id = ctx.session_id, window_id = w.window_id })
        return { window_id = w.window_id, focused = true }
      end
    end

    local home = os.getenv("HOME")
    local w, err = rex.call("session.new_window", {
      session_id   = ctx.session_id,
      window_label = label,
      layout       = term(home, { home .. "/.dotfiles/zshrc/bin/journal" }),
      focus        = true,
    })
    if err ~= nil then error(err, 0) end
    -- Select the new tab and hide the sidebar. The sidebar action is a toggle,
    -- so it only runs when the journal tab is created.
    rex.client.queue("session.select", { session_id = ctx.session_id, window_id = w.window_id })
    rex.client.queue("client.sidebar.toggle", {})
    return { window_id = w.window_id }
  end,
}
rex.bind("cmd+shift+j", "journal")

-- misc
rex.bind(p .. "c>h", "com.superlogical.terminal.clear")
rex.bind(p .. "r", "client.config.reload")
