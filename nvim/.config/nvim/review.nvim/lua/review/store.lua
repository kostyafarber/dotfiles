-- Review state: one JSON file per repo (or worktree), kept in its git dir so it
-- never shows up in the diff. The format is shared with Claude, see README.md.

local M = {}

local uv = vim.uv
local states = {} -- root -> state

local function realpath(p)
  return p and uv.fs_realpath(p) or p
end

-- The repo root and repo-relative path of a buffer's file, or nil.
function M.locate(buf)
  local name = vim.api.nvim_buf_get_name(buf)
  if name == "" or name:find("://", 1, true) then return nil end
  name = realpath(name) or name
  local root = realpath(vim.fs.root(name, ".git"))
  if not root then return nil end
  return root, vim.fs.relpath(root, name)
end

local function read(path)
  local f = io.open(path, "r")
  if not f then return { version = 1, threads = {} } end
  local text = f:read("a")
  f:close()
  return M.decode(text), text
end

function M.decode(text)
  local ok, data = pcall(vim.json.decode, text, { luanil = { object = true, array = true } })
  if not ok or type(data) ~= "table" then return nil end -- caught mid-write; keep what we have
  data.threads = data.threads or {}
  return data
end

local function state_dir(root)
  local res = vim.system({ "git", "-C", root, "rev-parse", "--absolute-git-dir" }, { text = true }):wait()
  if res.code == 0 then return vim.trim(res.stdout) end
  return vim.fn.stdpath("state") .. "/review/" .. vim.fn.sha256(root):sub(1, 12)
end

function M.get(root)
  if states[root] then return states[root] end
  local dir = state_dir(root)
  vim.fn.mkdir(dir, "p")
  local st = { root = root, dir = dir, path = dir .. "/review.json" }
  st.data = read(st.path) or { version = 1, threads = {} }
  states[root] = st
  return st
end

function M.all()
  return states
end

function M.save(st)
  local json = vim.json.encode(st.data)
  -- Pretty-printed so it reads well in a diff or an editor; jq is optional.
  local res = vim.system({ "jq", "." }, { stdin = json, text = true }):wait()
  if res.code == 0 then json = res.stdout end
  local tmp = st.path .. ".tmp"
  local f = assert(io.open(tmp, "w"))
  f:write(json)
  f:close()
  st.written = json
  os.rename(tmp, st.path)
end

-- Calls on_change(st) when someone else (Claude) rewrites the file.
function M.watch(st, on_change)
  if st.watcher then return end
  st.watcher = uv.new_fs_event()
  if not st.watcher then return end
  st.watcher:start(st.dir, {}, vim.schedule_wrap(function(err, fname)
    if err or (fname and fname ~= "review.json") then return end
    local data, text = read(st.path)
    if text == st.written then return end -- our own save
    if data then
      st.data = data
      on_change(st)
    end
  end))
end

return M
