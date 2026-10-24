-- Optional glue to codediff.nvim's file panel: list the files under review,
-- open one, and tick reviewed files. Uses codediff internals, so every call is
-- guarded and degrades to doing nothing.

local M = {}

local api = vim.api
local ns = api.nvim_create_namespace("review.files")

local function explorer()
  local ok, lifecycle = pcall(require, "codediff.ui.lifecycle")
  if not ok then return nil end
  local view = lifecycle.get_panel_view(api.nvim_get_current_tabpage())
  return view and view.tree and view.on_file_select and view or nil
end

local function all_files(ex)
  local ok, refresh = pcall(require, "codediff.ui.explorer.refresh")
  if not ok then return {} end
  local ok2, files = pcall(refresh.get_all_files, ex.tree)
  return ok2 and files or {}
end

-- Repo-relative paths in the panel's order, or nil outside a codediff tab.
function M.files()
  local ex = explorer()
  if not ex then return nil end
  return vim.tbl_map(function(f) return f.data.path end, all_files(ex))
end

function M.current()
  local ex = explorer()
  return ex and ex.current_file_path
end

-- Opens path in the diff, keeping the panel's cursor in step. True on success.
function M.select(path)
  local ex = explorer()
  if not ex then return false end
  for _, f in ipairs(all_files(ex)) do
    if f.data.path == path then
      if api.nvim_win_is_valid(ex.winid) then
        for line = 1, api.nvim_buf_line_count(ex.bufnr) do
          local node = ex.tree:get_node(line)
          if node and node.data and node.data.path == path then
            pcall(api.nvim_win_set_cursor, ex.winid, { line, 0 })
            break
          end
        end
      end
      ex.on_file_select(f.data)
      return true
    end
  end
  return false
end

-- Marks each file in the panel: state(path) returns "reviewed", "stale" or nil.
function M.decorate(state)
  local ex = explorer()
  if not ex or not api.nvim_buf_is_valid(ex.bufnr) then return end
  api.nvim_buf_clear_namespace(ex.bufnr, ns, 0, -1)
  for line = 1, api.nvim_buf_line_count(ex.bufnr) do
    local node = ex.tree:get_node(line)
    local s = node and node.data and node.data.path and state(node.data.path)
    if s then
      api.nvim_buf_set_extmark(ex.bufnr, ns, line - 1, 0, {
        virt_text = { s == "reviewed" and { " ✓", "ReviewSign" } or { " ✎", "ReviewMeta" } },
        virt_text_pos = "eol",
      })
    end
  end
end

return M
