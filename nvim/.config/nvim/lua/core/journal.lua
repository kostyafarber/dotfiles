-- Journal: one markdown file per day in iCloud Drive/Journal, opened in a calm writing mode.
--
--   <leader>J            today's entry (creates it with a dated heading)
--   :Journal             today
--   :Journal yesterday   or :Journal y, or :Journal 2026-11-01
--
-- The `journal` script (zshrc/bin/journal) opens the same files from a shell.

local dir = vim.env.JOURNAL_DIR or vim.fn.expand("~/Library/Mobile Documents/com~apple~CloudDocs/Journal")

local function date_for(arg)
  if arg == nil or arg == "" or arg == "today" or arg == "t" then
    return os.time()
  elseif arg == "yesterday" or arg == "y" then
    return os.time() - 24 * 60 * 60
  end
  local y, m, d = arg:match("^(%d%d%d%d)-(%d%d)-(%d%d)$")
  if not y then return nil end
  return os.time({ year = tonumber(y), month = tonumber(m), day = tonumber(d), hour = 12 })
end

local function open(arg)
  local t = date_for(arg)
  if not t then
    vim.notify("Journal: use today, yesterday or YYYY-MM-DD", vim.log.levels.WARN)
    return
  end
  local file = string.format("%s/%s.md", dir, os.date("%Y-%m-%d", t))
  if vim.fn.filereadable(file) == 0 then
    vim.fn.mkdir(dir, "p")
    local title = os.date("%A ", t) .. tonumber(os.date("%d", t)) .. os.date(" %B %Y", t)
    vim.fn.writefile({ "# " .. title, "" }, file)
  end
  vim.cmd.edit(vim.fn.fnameescape(file))
end

vim.api.nvim_create_user_command("Journal", function(opts) open(opts.args) end, {
  nargs = "?",
  complete = function() return { "today", "yesterday" } end,
  desc = "Open a journal entry",
})
vim.keymap.set("n", "<leader>J", function() open() end, { desc = "Journal: today" })

-- Writing mode for anything in the journal folder.
local group = vim.api.nvim_create_augroup("Journal", { clear = true })

local M = {}

-- Match by path prefix: the iCloud path has a space, which autocmd patterns mishandle.
local function in_journal(buf)
  return vim.api.nvim_buf_get_name(buf):sub(1, #dir + 1) == dir .. "/"
end

--- True when `buf` is a journal entry. Other plugin specs use this to stay out
--- of the journal (copilot.lua, dropbar.lua, treesitter-context.lua).
function M.is_journal(buf)
  return in_journal(buf or 0)
end

-- No language tooling while writing: detach any LSP client that attaches.
vim.api.nvim_create_autocmd("LspAttach", {
  group = group,
  callback = function(ev)
    if not in_journal(ev.buf) then return end
    vim.schedule(function()
      if vim.api.nvim_buf_is_valid(ev.buf) then
        pcall(vim.lsp.buf_detach_client, ev.buf, ev.data.client_id)
      end
    end)
  end,
})

vim.api.nvim_create_autocmd("BufEnter", {
  group = group,
  pattern = "*.md",
  callback = function(ev)
    if not in_journal(ev.buf) then return end
    local b = vim.b[ev.buf]
    b.completion = false        -- blink.cmp: no popup, docs, signature or ghost text
    b.snacks_indent = false     -- snacks: no indent guides
    vim.diagnostic.enable(false, { bufnr = ev.buf })
    vim.keymap.set("n", "K", "<nop>", { buffer = ev.buf, desc = "No hover in the journal" })
    local o = vim.opt_local
    o.wrap = true
    o.linebreak = true
    o.breakindent = true
    o.spell = true
    o.spelllang = "en_gb"
    o.textwidth = 0
    o.number = false
    o.relativenumber = false
    o.signcolumn = "no"
    o.cursorline = false
    o.conceallevel = 2
    -- Centre the text; no-neck-pain is lazy-loaded on its command.
    vim.schedule(function()
      local ok, nnp = pcall(function() return _G.NoNeckPain end)
      local on = ok and nnp and nnp.state and nnp.state.enabled
      if not on then pcall(vim.cmd, "NoNeckPain") end
    end)
  end,
})

-- Land at the end of the entry, ready to keep writing.
vim.api.nvim_create_autocmd("BufReadPost", {
  group = group,
  pattern = "*.md",
  callback = function(ev)
    if in_journal(ev.buf) then vim.cmd("normal! G") end
  end,
})

return M
