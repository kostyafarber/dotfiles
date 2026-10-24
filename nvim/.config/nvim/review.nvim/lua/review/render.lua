-- Draws threads on the code they're about, using extmarks so they follow the
-- code as it's edited. Three modes, cycled with <leader>ch:
--   compact  sign + a one-line preview at the end of the line; the full thread
--            pops up (peek) while the cursor is on it
--   cards    the full thread as a box under the code
--   hidden   signs only

local M = {}

local api = vim.api
M.ns = api.nvim_create_namespace("review")
M.focus_ns = api.nvim_create_namespace("review.focus")
M.modes = { "compact", "cards", "hidden" }
M.mode = "compact"
M.marks = {} -- buf -> { [thread_id] = { range = id } }

-- No fills: text is coloured by role, and boxes are thin borders.
function M.highlights()
  local function get(name) return api.nvim_get_hl(0, { name = name, link = false }) end
  local function set(name, from, extra)
    api.nvim_set_hl(0, name, vim.tbl_extend("force", { fg = get(from).fg }, extra or {}))
  end
  set("ReviewBody", "Normal")
  set("ReviewYou", "DiagnosticInfo", { bold = true })
  set("ReviewClaude", "DiagnosticHint", { bold = true })
  set("ReviewBorderYou", "DiagnosticInfo")
  set("ReviewBorderClaude", "DiagnosticHint")
  set("ReviewMeta", "Comment")
  set("ReviewCode", "String")
  set("ReviewResolved", "Comment", { italic = true })
  set("ReviewSign", "DiagnosticInfo")
  set("ReviewSignResolved", "Comment")
  api.nvim_set_hl(0, "ReviewAdd", { fg = get("Normal").fg, bg = get("DiffAdd").bg })
  api.nvim_set_hl(0, "ReviewDel", { fg = get("Comment").fg, bg = get("DiffDelete").bg })
  api.nvim_set_hl(0, "ReviewRange", { bg = get("CursorLine").bg })
  -- Line numbers mark commented ranges; they stay readable on any diff colour.
  local accent = get("DiagnosticInfo").fg
  api.nvim_set_hl(0, "ReviewNr", { fg = accent, bold = true })
  api.nvim_set_hl(0, "ReviewNrFocus", { fg = get("Normal").bg, bg = accent, bold = true })
  set("ReviewPreview", "Comment", { italic = true })
end

function M.ago(t)
  local d = os.time() - (t or os.time())
  if d < 60 then return "now" end
  if d < 3600 then return math.floor(d / 60) .. "m" end
  if d < 86400 then return math.floor(d / 3600) .. "h" end
  return os.date("%b %d", t)
end

-- The proposed lines of a suggestion: the first fenced block whose info string
-- contains "suggestion".
function M.suggestion(thread)
  for _, msg in ipairs(thread.messages) do
    local block = (msg.body or ""):match("```[^\n]*suggestion[^\n]*\n(.-)\n?```")
    if block then return vim.split(block, "\n") end
  end
end

-- Body text to { text, hl } rows: prose is word-wrapped, ``` blocks kept as is.
-- A suggestion block is shown as a diff against the thread's original lines.
local function body_rows(text, width, thread)
  local rows, fence = {}, nil
  for line in (text .. "\n"):gmatch("(.-)\n") do
    local info = line:match("^%s*```(.*)$")
    if info and not fence then
      fence = info:find("suggestion") and "suggestion" or "code"
      if fence == "suggestion" then
        for _, o in ipairs(thread.original or {}) do rows[#rows + 1] = { "- " .. o, "ReviewDel" } end
      end
    elseif info and fence then
      fence = nil
    elseif fence == "suggestion" then
      rows[#rows + 1] = { "+ " .. line, "ReviewAdd" }
    elseif fence then
      rows[#rows + 1] = { "  " .. line, "ReviewCode" }
    elseif line == "" then
      rows[#rows + 1] = { "", "ReviewBody" }
    else
      local cur = ""
      for word in line:gmatch("%S+") do
        if cur == "" then
          cur = word
        elseif vim.fn.strdisplaywidth(cur .. " " .. word) <= width then
          cur = cur .. " " .. word
        else
          rows[#rows + 1] = { cur, "ReviewBody" }
          cur = word
        end
      end
      rows[#rows + 1] = { cur, "ReviewBody" }
    end
  end
  return rows
end

-- A thread as virtual lines: a box like
--
--   ╭─ claude · 5m ──────────────────╮
--   │ Prose wrapped to the box width │
--   ├╌ you · now ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┤
--   │ A reply                        │
--   ╰────────────────────────────────╯
--
-- The border takes the colour of whoever spoke last, so you can see whose turn
-- it is. `spaced` adds a blank line above and below (for cards between code).
function M.box(thread, indent, width, spaced)
  local pad = string.rep(" ", indent)
  local inner = width - 4
  local last = thread.messages[#thread.messages] or {}
  local border = last.author == "claude" and "ReviewBorderClaude" or "ReviewBorderYou"
  local lines = {}
  local function dw(t) return vim.fn.strdisplaywidth(t) end
  if spaced then lines[1] = { { "", "" } } end

  local function rule(l, fill, r, msg)
    local claude = msg.author == "claude"
    local who = claude and "claude" or "you"
    local meta = " · " .. M.ago(msg.at) .. (l == "╭" and thread.kind == "suggestion" and " · suggestion" or "") .. " "
    lines[#lines + 1] = {
      { pad, "" },
      { l .. fill .. " ", border },
      { who, claude and "ReviewClaude" or "ReviewYou" },
      { meta, "ReviewMeta" },
      { string.rep(fill, math.max(width - 2 - dw(fill .. " " .. who .. meta), 0)) .. r, border },
    }
  end

  local function row(text, hl)
    text = vim.fn.strcharpart(text, 0, inner)
    local line = { { pad, "" }, { "│ ", border } }
    local used, i = 0, 1
    if hl == "ReviewBody" then
      -- In prose, `inline code` loses its backticks and is coloured instead.
      for seg in (text .. "`"):gmatch("(.-)`") do
        line[#line + 1] = { seg, i % 2 == 0 and "ReviewCode" or hl }
        used = used + dw(seg)
        i = i + 1
      end
      line[#line + 1] = { string.rep(" ", inner - used), hl }
    else
      line[#line + 1] = { text .. string.rep(" ", inner - dw(text)), hl }
    end
    line[#line + 1] = { " │", border }
    lines[#lines + 1] = line
  end

  for i, msg in ipairs(thread.messages) do
    if i == 1 then rule("╭", "─", "╮", msg) else rule("├", "╌", "┤", msg) end
    for _, r in ipairs(body_rows(msg.body or "", inner, thread)) do row(r[1], r[2]) end
  end
  lines[#lines + 1] = { { pad, "" }, { "╰" .. string.rep("─", width - 2) .. "╯", border } }
  if spaced then lines[#lines + 1] = { { "", "" } } end
  return lines
end

-- One-line preview for compact mode: "claude first line… · 3".
local function preview(thread, max)
  local first, last = thread.messages[1] or {}, thread.messages[#thread.messages] or {}
  local text = ((first.body or ""):gsub("```.*", "[code]"):gsub("%s+", " "))
  if #thread.messages > 1 then text = text .. " · " .. #thread.messages end
  text = vim.fn.strcharpart(text, 0, max)
  local claude = last.author == "claude"
  return {
    { "    ", "" },
    { thread.kind == "suggestion" and "󰛨 " or "󰭹 ", "ReviewSign" },
    { claude and "claude" or "you", claude and "ReviewClaude" or "ReviewYou" },
    { " · " .. text, "ReviewPreview" },
  }
end

-- 0-based row for a thread: its saved line if the text still matches, else the
-- nearest line with the same text, else the saved line clamped to the buffer.
local function anchor(lines, t)
  local line = t.line or 1
  if t.line_text == nil or lines[line] == t.line_text then
    return math.min(math.max(line, 1), #lines) - 1
  end
  for d = 1, 300 do
    if lines[line - d] == t.line_text then return line - d - 1 end
    if lines[line + d] == t.line_text then return line + d - 1 end
  end
  return math.min(math.max(line, 1), #lines) - 1
end

function M.render(buf, st, rel)
  if buf == 0 then buf = api.nvim_get_current_buf() end
  if not api.nvim_buf_is_valid(buf) then return end
  api.nvim_buf_clear_namespace(buf, M.ns, 0, -1)
  M.marks[buf] = {}
  local lines = api.nvim_buf_get_lines(buf, 0, -1, false)
  if #lines == 0 then return end

  local win = vim.fn.bufwinid(buf)
  local avail = win ~= -1 and (api.nvim_win_get_width(win) - vim.fn.getwininfo(win)[1].textoff) or 100

  for _, t in ipairs(st.data.threads) do
    if t.file == rel then
      local row = anchor(lines, t)
      local end_row = math.min(row + math.max((t.end_line or t.line) - t.line, 0), #lines - 1)
      local resolved = t.status == "resolved"

      local opts = {
        end_row = end_row,
        end_col = #lines[end_row + 1],
        sign_text = t.kind == "suggestion" and "󰛨" or "󰭹",
        sign_hl_group = resolved and "ReviewSignResolved" or "ReviewSign",
        priority = 5,
      }
      if M.mode == "compact" and not resolved then
        opts.virt_text = preview(t, math.max(avail - vim.fn.strdisplaywidth(lines[row + 1]) - 14, 10))
        opts.virt_text_pos = "eol"
      end
      M.marks[buf][t.id] = { range = api.nvim_buf_set_extmark(buf, M.ns, row, 0, opts) }
      if not resolved then
        for r = row, end_row do
          api.nvim_buf_set_extmark(buf, M.ns, r, 0, { number_hl_group = "ReviewNr", priority = 20 })
        end
      end

      if M.mode == "cards" then
        local indent = vim.fn.indent(row + 1)
        local width = math.max(math.min(64, avail - indent - 2), 24)
        local first = ((t.messages[1] or {}).body or ""):gsub("\n.*", "")
        local virt = resolved
            and { { { string.rep(" ", indent) .. "✓ " .. vim.fn.strcharpart(first, 0, width), "ReviewResolved" } } }
            or M.box(t, indent, width, true)
        api.nvim_buf_set_extmark(buf, M.ns, end_row, 0, { virt_lines = virt })
      end
    end
  end
end

-- Copies extmark positions back into the threads, so saved lines follow edits.
function M.sync(buf, st, rel)
  if buf == 0 then buf = api.nvim_get_current_buf() end
  local marks = M.marks[buf]
  if not marks or not api.nvim_buf_is_valid(buf) then return end
  for _, t in ipairs(st.data.threads) do
    local m = t.file == rel and marks[t.id]
    if m then
      local pos = api.nvim_buf_get_extmark_by_id(buf, M.ns, m.range, { details = true })
      if pos[1] then
        t.line = pos[1] + 1
        t.end_line = (pos[3].end_row or pos[1]) + 1
        t.line_text = api.nvim_buf_get_lines(buf, pos[1], pos[1] + 1, false)[1]
      end
    end
  end
end

-- Threads the cursor is "on": its line is inside a thread's range, or (in
-- cards mode) just below it, where the card is drawn, since the cursor can't
-- enter a card. Nearest first; the second value has their 0-based ranges.
function M.at_cursor(buf, st, rel)
  if buf == 0 then buf = api.nvim_get_current_buf() end
  local row = api.nvim_win_get_cursor(0)[1] - 1
  local below = M.mode == "cards" and 1 or 0
  local hits = {}
  for _, t in ipairs(st.data.threads) do
    local m = t.file == rel and (M.marks[buf] or {})[t.id]
    if m then
      local pos = api.nvim_buf_get_extmark_by_id(buf, M.ns, m.range, { details = true })
      local s, e = pos[1], pos[1] and (pos[3].end_row or pos[1])
      if s and row >= s and row <= e + below then
        hits[#hits + 1] = { t = t, s = s, e = e, d = row <= e and 0 or 1 }
      end
    end
  end
  table.sort(hits, function(a, b) return a.d ~= b.d and a.d < b.d or a.s > b.s end)
  return vim.tbl_map(function(h) return h.t end, hits), hits
end

-- Highlights the range of the thread the cursor is on, and returns that thread.
function M.focus(buf, st, rel)
  if buf == 0 then buf = api.nvim_get_current_buf() end
  api.nvim_buf_clear_namespace(buf, M.focus_ns, 0, -1)
  if not st then return nil end
  local threads, hits = M.at_cursor(buf, st, rel)
  local h = hits[1]
  if not h then return nil end
  local last = api.nvim_buf_get_lines(buf, h.e, h.e + 1, false)[1] or ""
  api.nvim_buf_set_extmark(buf, M.focus_ns, h.s, 0, {
    end_row = h.e,
    end_col = #last,
    hl_group = "ReviewRange",
    hl_eol = true,
    priority = 5,
  })
  for r = h.s, h.e do
    api.nvim_buf_set_extmark(buf, M.focus_ns, r, 0, { number_hl_group = "ReviewNrFocus", priority = 30 })
  end
  if M.mode == "cards" then
    local n = #threads > 1 and (#threads .. " threads · ") or ""
    api.nvim_buf_set_extmark(buf, M.focus_ns, h.s, 0, {
      virt_text = { { "  " .. n .. "↵ open thread", "ReviewMeta" } },
      virt_text_pos = "eol",
    })
  end
  return h.t
end

-- Sorted 1-based start lines of this buffer's threads.
function M.rows(buf)
  if buf == 0 then buf = api.nvim_get_current_buf() end
  local out = {}
  for _, m in pairs(M.marks[buf] or {}) do
    local pos = api.nvim_buf_get_extmark_by_id(buf, M.ns, m.range, {})
    if pos[1] then out[#out + 1] = pos[1] + 1 end
  end
  table.sort(out)
  return out
end

return M
