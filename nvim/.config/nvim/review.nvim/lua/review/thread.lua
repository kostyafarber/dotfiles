-- A thread opened as a conversation: history on top, your reply at the bottom,
-- in a real markdown buffer so you can move around, select, and yank from it.

local api = vim.api

local SEP = "──── reply · ⌃S send · ⌃R resolve · q close ────"

local function ago(t)
  local d = os.time() - (t or os.time())
  if d < 60 then return "now" end
  if d < 3600 then return math.floor(d / 60) .. "m ago" end
  if d < 86400 then return math.floor(d / 3600) .. "h ago" end
  return os.date("%b %d", t)
end

-- opts: { title, on_reply = fn(text), on_resolve = fn(), on_apply = fn() for
-- suggestions, on_close = fn() }
return function(thread, opts)
  local lines = {}
  for _, msg in ipairs(thread.messages) do
    lines[#lines + 1] = "### " .. (msg.author == "claude" and "claude" or "you") .. " · " .. ago(msg.at)
    vim.list_extend(lines, vim.split(msg.body or "", "\n"))
    lines[#lines + 1] = ""
  end
  if thread.status == "resolved" then lines[#lines + 1] = "_resolved_" ; lines[#lines + 1] = "" end
  lines[#lines + 1] = opts.on_apply and (SEP:gsub(" · q close", " · ⌃A apply · q close")) or SEP
  lines[#lines + 1] = ""

  local buf = api.nvim_create_buf(false, true)
  api.nvim_buf_set_lines(buf, 0, -1, false, lines)
  vim.bo[buf].filetype = "markdown"
  vim.bo[buf].bufhidden = "wipe"

  local width = math.min(80, vim.o.columns - 6)
  local win = api.nvim_open_win(buf, true, {
    relative = "cursor",
    row = 1,
    col = 0,
    width = width,
    height = math.max(math.min(#lines + 2, math.floor(vim.o.lines * 0.6)), 6),
    style = "minimal",
    border = "rounded",
    title = " " .. opts.title .. " ",
  })
  vim.wo[win].wrap = true
  vim.wo[win].linebreak = true
  vim.wo[win].conceallevel = 2

  local ns = api.nvim_create_namespace("review.thread")
  local sep_row = #lines - 2
  api.nvim_buf_set_extmark(buf, ns, sep_row, 0, { line_hl_group = "ReviewMeta" })

  local done = false
  local function close()
    if done then return end
    done = true
    vim.cmd("stopinsert")
    pcall(api.nvim_win_close, win, true)
    if opts.on_close then opts.on_close() end
  end
  local function reply_text()
    local all = api.nvim_buf_get_lines(buf, 0, -1, false)
    for i = #all, 1, -1 do
      if all[i]:find("^──── reply") then return vim.trim(table.concat(all, "\n", i + 1)) end
    end
    return ""
  end
  local function send()
    local text = reply_text()
    close()
    if text ~= "" then opts.on_reply(text) end
  end
  local function resolve()
    local text = reply_text()
    close()
    if text ~= "" then opts.on_reply(text) end
    opts.on_resolve()
  end

  local o = { buffer = buf, nowait = true }
  if opts.on_apply then
    vim.keymap.set({ "n", "i" }, "<C-a>", function() close(); opts.on_apply() end, o)
  end
  vim.keymap.set({ "n", "i" }, "<C-s>", send, o)
  vim.keymap.set({ "n", "i" }, "<C-r>", resolve, o)
  vim.keymap.set("n", "q", close, o)
  vim.keymap.set("n", "<Esc>", close, o)
  api.nvim_create_autocmd("WinLeave", {
    buffer = buf,
    once = true,
    callback = function() vim.schedule(close) end,
  })

  api.nvim_win_set_cursor(win, { #lines, 0 })
  vim.cmd("startinsert")
end
