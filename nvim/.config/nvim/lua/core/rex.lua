-- Rex integration: only loaded when nvim runs inside a Rex pane.
--
-- 1. Navigation: Rex's prefix h/j/k/l sends <M-H>/<M-J>/<M-K>/<M-L> while nvim
--    is in the foreground (see rex/.config/rex/init.lua). Those move between
--    nvim splits, and at the edge hand off to Rex with `rex focus <dir>`.
-- 2. <leader>a sends @file:line (or the visual range) to the Claude pane in
--    the same Rex tab, or else anywhere in the session.
-- 3. nvim listens on /tmp/rex-nvim-$UID/<window>.sock, so `nvo file:line`
--    (zshrc/bin/nvo) run from any pane in the same Rex tab opens it here.

local M = {}

local session = vim.env.REX_SESSION
local block = vim.env.REX_BLOCK

local k = vim.keymap.set

local function rex(args, on_exit)
  local cmd = { "rex" }
  vim.list_extend(cmd, args)
  return vim.system(cmd, { text = true }, on_exit and vim.schedule_wrap(on_exit))
end

-- Navigation -----------------------------------------------------------------

local dirs = { h = "left", j = "down", k = "up", l = "right" }

for key, dir in pairs(dirs) do
  k({ "n", "t" }, "<M-" .. key:upper() .. ">", function()
    if vim.fn.winnr(key) ~= vim.fn.winnr() then
      vim.cmd.wincmd(key)
    else
      rex({ "focus", "-s", session, dir })
    end
  end, { desc = "Focus " .. dir .. " (nvim split or Rex pane)" })
end

-- Panes in this tab ------------------------------------------------------------

local terminal = "com.superlogical.terminal"

-- Calls cb(window_id, panes) where panes are the other terminal blocks in this
-- nvim's Rex tab (every tab of the session with whole_session), each
-- { id, label, fg } with fg its foreground process.
local function tab_panes(cb, whole_session)
  rex({ "block", "ls", "-s", session, "--json" }, function(res)
    local ok, list = pcall(vim.json.decode, res.stdout or "")
    if not ok then return cb(nil, {}) end

    local window
    for _, b in ipairs(list.blocks or {}) do
      if b.block_id == block then window = b.window_id end
    end

    local panes = {}
    for _, b in ipairs(list.blocks or {}) do
      if (whole_session or b.window_id == window) and b.block_id ~= block and b.creator_name == terminal then
        panes[#panes + 1] = { id = b.block_id, label = b.label }
      end
    end

    local pending = #panes
    if pending == 0 then return cb(window, panes) end
    for _, pane in ipairs(panes) do
      rex({ "block", "call", "-s", session, "-b", pane.id, "process" }, function(p)
        local pok, proc = pcall(vim.json.decode, p.stdout or "")
        pane.fg = pok and proc.foreground or {}
        pending = pending - 1
        if pending == 0 then cb(window, panes) end
      end)
    end
  end)
end

local function is_claude(pane)
  return pane.fg.argv0 == "claude" or (pane.fg.invoked_path or ""):match("/claude$") ~= nil
end

-- Send to Claude ---------------------------------------------------------------

-- Types text into the Claude pane and focuses it; submit also presses Enter.
-- Prefers a Claude pane in this tab, then any in the session (e.g. from a review tab).
local function send_to_agent(text, submit)
  local function deliver(agent)
    rex({ "send", "-s", session, "-b", agent.id, text }, function()
      if submit then rex({ "send-key", "-s", session, "-b", agent.id, "enter" }) end
      rex({ "focus", "-s", session, agent.id })
    end)
  end
  tab_panes(function(_, panes)
    local agent = vim.iter(panes):find(is_claude)
    if agent then return deliver(agent) end
    tab_panes(function(_, all)
      agent = vim.iter(all):find(is_claude)
      if not agent then return vim.notify("no claude pane in this session", vim.log.levels.WARN) end
      deliver(agent)
    end, true)
  end)
end
M.send_to_agent = send_to_agent

local function relpath()
  return vim.fn.fnamemodify(vim.fn.expand("%:p"), ":.")
end

k("n", "<leader>a", function()
  send_to_agent("@" .. relpath() .. ":" .. vim.fn.line(".") .. " ")
end, { desc = "Send file:line to Claude pane" })

k("x", "<leader>a", function()
  local a, b = vim.fn.line("v"), vim.fn.line(".")
  if a > b then a, b = b, a end
  vim.cmd("normal! \27") -- leave visual mode
  send_to_agent("@" .. relpath() .. ":" .. a .. "-" .. b .. " ")
end, { desc = "Send selected lines to Claude pane" })

-- Socket for nvo -----------------------------------------------------------------

-- Short path on purpose: macOS caps Unix socket paths at 104 bytes.
local sock_dir = "/tmp/rex-nvim-" .. vim.uv.getuid()

tab_panes(function(window)
  if not window then return end
  vim.fn.mkdir(sock_dir, "p", "0700")
  -- No colon: serverstart reads "a:b" as host:port.
  local sock = sock_dir .. "/" .. window:gsub("^window:", "") .. ".sock"
  -- A newer nvim in the same tab takes over; a stale socket is just removed.
  vim.uv.fs_unlink(sock)
  if pcall(vim.fn.serverstart, sock) then
    vim.api.nvim_create_autocmd("VimLeavePre", {
      callback = function() vim.uv.fs_unlink(sock) end,
    })
  end
end)

return M
