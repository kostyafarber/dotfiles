-- review.nvim: leave review comments on code as overlays, and trade replies
-- with Claude through a JSON file it can read and write. See README.md.

local M = {}

local api = vim.api
local store = require("review.store")
local render = require("review.render")
local input = require("review.input")
local thread_view = require("review.thread")
local peek = require("review.peek")
local codediff = require("review.codediff")

-- Every loaded buffer under st.root, as { buf, rel } pairs.
local function buffers(st)
  local out = {}
  for _, buf in ipairs(api.nvim_list_bufs()) do
    if api.nvim_buf_is_loaded(buf) then
      local root, rel = store.locate(buf)
      if root == st.root then out[#out + 1] = { buf, rel } end
    end
  end
  return out
end

local function refresh(st)
  for _, b in ipairs(buffers(st)) do render.render(b[1], st, b[2]) end
end

local function sync_and_save(st)
  for _, b in ipairs(buffers(st)) do render.sync(b[1], st, b[2]) end
  store.save(st)
end

-- The review state and relative path for the current buffer, or nil.
local function current()
  local root, rel = store.locate(0)
  if not root then
    vim.notify("review: this buffer isn't a file in a git repo", vim.log.levels.WARN)
    return nil
  end
  local st = store.get(root)
  store.watch(st, refresh)
  return st, rel
end

local function id()
  return string.format("%x%04x", os.time(), math.random(0, 0xffff))
end

function M.comment()
  local st, rel = current()
  if not st then return end
  local a, b = vim.fn.line("v"), vim.fn.line(".")
  if not vim.fn.mode():match("[vV\22]") then a = b end
  if a > b then a, b = b, a end
  vim.cmd("normal! \27")
  local buf = api.nvim_get_current_buf()
  input(a == b and ("comment · line " .. a) or ("comment · lines " .. a .. "-" .. b), function(text)
    render.sync(buf, st, rel)
    table.insert(st.data.threads, {
      id = id(),
      file = rel,
      line = a,
      end_line = b,
      line_text = api.nvim_buf_get_lines(buf, a - 1, a, false)[1],
      status = "open",
      messages = { { author = "you", body = text, at = os.time() } },
    })
    store.save(st)
    refresh(st)
  end)
end

-- A suggestion: the selected lines, prefilled as code for you to rewrite, shown
-- to you and Claude as a diff (GitHub's "suggest changes").
function M.suggest()
  local st, rel = current()
  if not st then return end
  local a, b = vim.fn.line("v"), vim.fn.line(".")
  if not vim.fn.mode():match("[vV\22]") then a = b end
  if a > b then a, b = b, a end
  vim.cmd("normal! \27")
  local buf = api.nvim_get_current_buf()
  local original = api.nvim_buf_get_lines(buf, a - 1, b, false)
  local lines = { "```" .. vim.bo[buf].filetype .. " suggestion" }
  vim.list_extend(lines, original)
  lines[#lines + 1] = "```"
  lines[#lines + 1] = ""
  input("suggest · lines " .. a .. "-" .. b, function(text)
    render.sync(buf, st, rel)
    table.insert(st.data.threads, {
      id = id(),
      kind = "suggestion",
      file = rel,
      line = a,
      end_line = b,
      line_text = original[1],
      original = original,
      status = "open",
      messages = { { author = "you", body = text, at = os.time() } },
    })
    store.save(st)
    refresh(st)
  end, { lines = lines, cursor = { 2, 0 }, insert = false })
end

-- Replaces a suggestion's lines in the buffer with the suggested ones.
local function apply(st, t, buf)
  local lines = render.suggestion(t)
  local m = (render.marks[buf] or {})[t.id]
  if not lines or not m then return vim.notify("review: nothing to apply") end
  local pos = api.nvim_buf_get_extmark_by_id(buf, render.ns, m.range, { details = true })
  api.nvim_buf_set_lines(buf, pos[1], (pos[3].end_row or pos[1]) + 1, false, lines)
  t.status = "resolved"
  table.insert(t.messages, { author = "you", body = "Applied.", at = os.time() })
  sync_and_save(st)
  refresh(st)
end

local function excerpt(t)
  local m = t.messages[1] or {}
  return (m.author or "") .. ": " .. ((m.body or ""):gsub("\n.*", ""))
end

-- Runs fn(st, thread) for the thread the cursor is on, asking when there are several.
local function with_thread(fn)
  local st, rel = current()
  if not st then return end
  local threads = render.at_cursor(0, st, rel)
  if #threads == 0 then
    return vim.notify("review: no thread here (look for 󰭹 in the sign column)")
  end
  if #threads == 1 then return fn(st, threads[1]) end
  vim.ui.select(threads, { prompt = "Thread", format_item = excerpt }, function(t)
    if t then fn(st, t) end
  end)
end

-- Opens the thread on the cursor line as a conversation you can reply in.
function M.open()
  local buf = api.nvim_get_current_buf()
  with_thread(function(st, t)
    local _, rel = store.locate(buf)
    peek.close()
    thread_view(t, {
      title = string.format("%s:%d", rel, t.line),
      on_apply = t.kind == "suggestion" and function() apply(st, t, buf) end or nil,
      on_reply = function(text)
        table.insert(t.messages, { author = "you", body = text, at = os.time() })
        t.status = "open"
        sync_and_save(st)
        refresh(st)
      end,
      on_resolve = function()
        t.status = t.status == "resolved" and "open" or "resolved"
        sync_and_save(st)
        refresh(st)
      end,
    })
  end)
end

M.reply = M.open

function M.resolve()
  with_thread(function(st, t)
    t.status = t.status == "resolved" and "open" or "resolved"
    sync_and_save(st)
    refresh(st)
  end)
end

function M.delete()
  with_thread(function(st, t)
    if vim.fn.confirm("Delete this comment thread?", "&Yes\n&No", 2) ~= 1 then return end
    st.data.threads = vim.tbl_filter(function(x) return x.id ~= t.id end, st.data.threads)
    sync_and_save(st)
    refresh(st)
  end)
end

function M.jump(dir)
  local rows = render.rows(0)
  local cur = api.nvim_win_get_cursor(0)[1]
  local target
  if dir > 0 then
    for _, r in ipairs(rows) do if r > cur then target = r break end end
    target = target or rows[1]
  else
    for i = #rows, 1, -1 do if rows[i] < cur then target = rows[i] break end end
    target = target or rows[#rows]
  end
  if target then api.nvim_win_set_cursor(0, { target, 0 }) end
end

-- Open threads across the repo, in quickfix.
function M.list()
  local st = current()
  if not st then return end
  sync_and_save(st)
  local items = {}
  for _, t in ipairs(st.data.threads) do
    if t.status ~= "resolved" then
      local last = t.messages[#t.messages] or {}
      items[#items + 1] = {
        filename = st.root .. "/" .. t.file,
        lnum = t.line,
        text = (last.author or "") .. ": " .. (last.body or ""):gsub("\n.*", ""),
      }
    end
  end
  if #items == 0 then return vim.notify("review: no open comments") end
  vim.fn.setqflist({}, " ", { title = "review", items = items })
  vim.cmd("copen")
end

-- Cycles compact → cards → hidden.
function M.toggle()
  local i = vim.fn.index(render.modes, render.mode) + 1
  render.mode = render.modes[i % #render.modes + 1]
  peek.close()
  for _, st in pairs(store.all()) do refresh(st) end
  vim.notify("review: " .. render.mode)
end

-- Reviewed files ----------------------------------------------------------------

local function file_hash(st, file)
  local ok, lines = pcall(vim.fn.readfile, st.root .. "/" .. file, "b")
  return ok and vim.fn.sha256(table.concat(lines, "\n")) or nil
end

-- "reviewed", "stale" (changed since you marked it) or nil.
local function file_state(st, file)
  local h = (st.data.reviewed or {})[file]
  if not h then return nil end
  return h == file_hash(st, file) and "reviewed" or "stale"
end

-- Files under review: codediff's panel if open, else changes since the
-- checkpoint (or HEAD) plus untracked files.
local function review_files(st)
  local files = codediff.files()
  if files then return files end
  local base = st.data.checkpoint or "HEAD"
  local out = {}
  for _, cmd in ipairs({ { "diff", "--name-only", base }, { "ls-files", "--others", "--exclude-standard" } }) do
    local res = vim.system(vim.list_extend({ "git", "-C", st.root }, cmd), { text = true }):wait()
    for f in (res.stdout or ""):gmatch("[^\n]+") do out[#out + 1] = f end
  end
  return out
end

local function decorate(st)
  codediff.decorate(function(path) return file_state(st, path) end)
end

local function goto_file(st, file)
  if not codediff.select(file) then vim.cmd.edit(vim.fn.fnameescape(st.root .. "/" .. file)) end
end

-- The next file after the current one that isn't reviewed (or changed since).
function M.next_unreviewed(dir)
  local st, rel = current()
  if not st then return end
  local files = review_files(st)
  local cur = codediff.current() or rel
  local start = 0
  for i, f in ipairs(files) do if f == cur then start = i end end
  for step = 1, #files do
    local f = files[((start - 1 + step * (dir or 1)) % #files) + 1]
    if f ~= cur and file_state(st, f) ~= "reviewed" then return goto_file(st, f) end
  end
  vim.notify("review: every file is reviewed")
end

-- Marks this file reviewed (or unmarks it), then moves on to the next one.
function M.mark_reviewed()
  local st, rel = current()
  if not st then return end
  if vim.bo.modified then vim.cmd("silent write") end
  st.data.reviewed = st.data.reviewed or {}
  local marking = file_state(st, rel) ~= "reviewed"
  st.data.reviewed[rel] = marking and file_hash(st, rel) or nil
  if next(st.data.reviewed) == nil then st.data.reviewed = nil end
  sync_and_save(st)
  decorate(st)
  local files = review_files(st)
  local done = #vim.tbl_filter(function(f) return file_state(st, f) == "reviewed" end, files)
  vim.notify(string.format("review: %s · %d/%d files reviewed", marking and "✓ " .. rel or "unmarked " .. rel, done, #files))
  if marking and done < #files then M.next_unreviewed(1) end
end

-- Hand the review to Claude: in Rex, type a prompt into the Claude pane;
-- elsewhere, copy it to the clipboard.
function M.send()
  local st = current()
  if not st then return end
  sync_and_save(st)
  local open = #vim.tbl_filter(function(t) return t.status ~= "resolved" end, st.data.threads)
  local prompt = string.format(
    "Check my review: %d open comment(s) in %s, plus any code edits I made. "
      .. "Reply in each thread (or change the code and say so), following "
      .. "~/.config/nvim/review.nvim/README.md.",
    open, st.path)
  local ok, rex = pcall(require, "core/rex")
  if vim.env.REX_SESSION and ok and type(rex) == "table" then
    rex.send_to_agent(prompt, true)
  else
    vim.fn.setreg("+", prompt)
    vim.notify("review: prompt copied to clipboard")
  end
end

-- Opens a review of everything changed since base, in a new tab: codediff's
-- side by side with threads drawn on the editable side. dir picks the repo.
function M.review(base, dir)
  local root = vim.fs.root(dir or vim.fn.getcwd(), ".git")
  if not root then return vim.notify("review: not in a git repo", vim.log.levels.WARN) end
  vim.cmd("tabnew")
  vim.cmd.tcd(vim.fn.fnameescape(root))
  vim.cmd("CodeDiff " .. (base or "HEAD"))
end

function M.setup()
  render.highlights()
  api.nvim_create_user_command("Review", function(o) M.review(o.args ~= "" and o.args or nil) end,
    { nargs = "?", desc = "Review changes since a revision (default HEAD)" })
  local group = api.nvim_create_augroup("review", { clear = true })
  api.nvim_create_autocmd("ColorScheme", { group = group, callback = render.highlights })

  api.nvim_create_autocmd({ "BufWinEnter", "BufReadPost" }, {
    group = group,
    callback = function(ev)
      local root, rel = store.locate(ev.buf)
      if not root then return end
      local st = store.get(root)
      store.watch(st, refresh)
      render.render(ev.buf, st, rel)
    end,
  })
  api.nvim_create_autocmd("BufWritePost", {
    group = group,
    callback = function(ev)
      local root, rel = store.locate(ev.buf)
      local st = root and store.all()[root]
      if st and render.marks[ev.buf] and next(render.marks[ev.buf]) then
        render.sync(ev.buf, st, rel)
        store.save(st)
      end
    end,
  })
  -- Highlight the thread under the cursor and, in compact mode, peek at it.
  local timer = vim.uv.new_timer()
  api.nvim_create_autocmd({ "CursorMoved", "BufEnter" }, {
    group = group,
    callback = function(ev)
      if not render.marks[ev.buf] or not next(render.marks[ev.buf]) then
        render.focus(ev.buf, nil)
        return peek.close()
      end
      local root, rel = store.locate(ev.buf)
      local t = render.focus(ev.buf, root and store.all()[root], rel)
      if not t or render.mode ~= "compact" then return peek.close() end
      local win, row = api.nvim_get_current_win(), api.nvim_win_get_cursor(0)[1]
      timer:stop()
      timer:start(120, 0, vim.schedule_wrap(function()
        if api.nvim_get_current_win() == win and api.nvim_win_get_cursor(win)[1] == row then
          peek.show(t, win, row)
        end
      end))
    end,
  })
  api.nvim_create_autocmd({ "WinLeave", "InsertEnter", "BufLeave" }, {
    group = group,
    callback = function() peek.close() end,
  })
  api.nvim_create_autocmd("User", {
    group = group,
    pattern = { "CodeDiffOpen", "CodeDiffFileSelect" },
    callback = function()
      vim.defer_fn(function()
        for _, st in pairs(store.all()) do decorate(st) end
      end, 200)
    end,
  })
  api.nvim_create_autocmd("VimResized", {
    group = group,
    callback = function() for _, st in pairs(store.all()) do refresh(st) end end,
  })

  local k = vim.keymap.set
  k({ "n", "x" }, "<leader>cc", M.comment, { desc = "Review: comment" })
  k("n", "<leader>cr", M.open, { desc = "Review: open thread / reply" })
  -- Enter opens the thread when the cursor is on one, and is Enter otherwise.
  k("n", "<CR>", function()
    local root, rel = store.locate(0)
    local st = root and store.all()[root]
    if vim.bo.buftype == "" and st and #render.at_cursor(0, st, rel) > 0 then
      return "<Cmd>lua require('review').open()<CR>"
    end
    return "<CR>"
  end, { expr = true, desc = "Review: open thread" })
  k("n", "<leader>cx", M.resolve, { desc = "Review: resolve / reopen" })
  k("n", "<leader>cd", M.delete, { desc = "Review: delete thread" })
  k("n", "<leader>cl", M.list, { desc = "Review: list open comments" })
  k({ "n", "x" }, "<leader>cg", M.suggest, { desc = "Review: suggest a change" })
  k("n", "<leader>ch", M.toggle, { desc = "Review: compact / cards / hidden" })
  k("n", "<leader>cv", M.mark_reviewed, { desc = "Review: mark file reviewed, next" })
  k("n", "]u", function() M.next_unreviewed(1) end, { desc = "Next unreviewed file" })
  k("n", "[u", function() M.next_unreviewed(-1) end, { desc = "Prev unreviewed file" })
  k("n", "<leader>cs", M.send, { desc = "Review: send to Claude" })
  k("n", "<leader>cR", function() M.review() end, { desc = "Review: changes since HEAD" })
  k("n", "]r", function() M.jump(1) end, { desc = "Next review comment" })
  k("n", "[r", function() M.jump(-1) end, { desc = "Prev review comment" })
end

return M
