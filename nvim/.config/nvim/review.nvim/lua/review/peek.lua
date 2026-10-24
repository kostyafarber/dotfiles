-- The thread under the cursor, shown in a corner of the window without taking
-- focus (like octo.nvim's thread panel). Enter opens it for replying.

local M = {}

local api = vim.api
local render = require("review.render")
local state = { win = nil, buf = nil, id = nil }

function M.close()
  if state.win and api.nvim_win_is_valid(state.win) then api.nvim_win_close(state.win, true) end
  state.win, state.id = nil, nil
end

function M.show(thread, src_win, cursor_row)
  if state.id == thread.id and state.win and api.nvim_win_is_valid(state.win) then return end
  M.close()

  local w = api.nvim_win_get_width(src_win)
  local h = api.nvim_win_get_height(src_win)
  local width = math.min(66, w - 4)
  if width < 30 then return end

  -- Reuse the card renderer, flattened to text plus highlights.
  local box = render.box(thread, 0, width, false)
  local text, marks = {}, {}
  for i, chunks in ipairs(box) do
    local line, col = "", 0
    for _, c in ipairs(chunks) do
      if c[2] ~= "" then marks[#marks + 1] = { i - 1, col, col + #c[1], c[2] } end
      line = line .. c[1]
      col = col + #c[1]
    end
    text[i] = line
  end
  text[#text + 1] = thread.kind == "suggestion" and "  ↵ reply / apply" or "  ↵ reply"
  marks[#marks + 1] = { #text - 1, 0, #text[#text], "ReviewMeta" }

  state.buf = state.buf and api.nvim_buf_is_valid(state.buf) and state.buf or api.nvim_create_buf(false, true)
  api.nvim_buf_set_lines(state.buf, 0, -1, false, text)
  local ns = api.nvim_create_namespace("review.peek")
  api.nvim_buf_clear_namespace(state.buf, ns, 0, -1)
  for _, m in ipairs(marks) do
    api.nvim_buf_set_extmark(state.buf, ns, m[1], m[2], { end_col = m[3], hl_group = m[4] })
  end

  -- Bottom-right of the window, or top-right if the cursor is in the lower half.
  local height = math.min(#text, math.floor(h * 0.5))
  local cur_screen = cursor_row - vim.fn.line("w0", src_win)
  local top = cur_screen > h / 2
  state.win = api.nvim_open_win(state.buf, false, {
    relative = "win",
    win = src_win,
    anchor = top and "NE" or "SE",
    row = top and 0 or h,
    col = w,
    width = width,
    height = height,
    style = "minimal",
    focusable = false,
    zindex = 40,
    noautocmd = true,
  })
  vim.wo[state.win].winhighlight = "Normal:Normal"
  state.id = thread.id
end

return M
