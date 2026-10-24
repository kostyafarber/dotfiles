-- A small floating editor for writing a comment or reply. Markdown, so code
-- fences highlight while you type. opts: { lines = initial text, cursor =
-- {row, col} to start at, insert = false to start in normal mode }.

local api = vim.api

return function(title, on_submit, opts)
  opts = opts or {}
  local buf = api.nvim_create_buf(false, true)
  vim.bo[buf].filetype = "markdown"
  vim.bo[buf].bufhidden = "wipe"
  if opts.lines then api.nvim_buf_set_lines(buf, 0, -1, false, opts.lines) end
  local win = api.nvim_open_win(buf, true, {
    relative = "cursor",
    row = 1,
    col = 0,
    width = math.min(72, vim.o.columns - 6),
    height = math.max(5, math.min(#(opts.lines or {}) + 2, 20)),
    style = "minimal",
    border = "rounded",
    title = " " .. title .. " ",
    footer = " ⌃S save · Esc Esc cancel ",
    footer_pos = "right",
  })
  vim.wo[win].wrap = true
  vim.wo[win].linebreak = true

  local done = false
  local function close()
    done = true
    vim.cmd("stopinsert")
    pcall(api.nvim_win_close, win, true)
  end
  local function submit()
    if done then return end
    local text = vim.trim(table.concat(api.nvim_buf_get_lines(buf, 0, -1, false), "\n"))
    close()
    if text ~= "" then on_submit(text) end
  end

  local o = { buffer = buf, nowait = true }
  vim.keymap.set({ "n", "i" }, "<C-s>", submit, o)
  vim.keymap.set("n", "<CR>", submit, o)
  vim.keymap.set("n", "<Esc>", close, o)
  vim.keymap.set("n", "q", close, o)
  api.nvim_create_autocmd("WinLeave", {
    buffer = buf,
    once = true,
    callback = function() vim.schedule(function() if not done then close() end end) end,
  })
  if opts.cursor then api.nvim_win_set_cursor(win, opts.cursor) end
  if opts.insert ~= false then vim.cmd("startinsert") end
end
