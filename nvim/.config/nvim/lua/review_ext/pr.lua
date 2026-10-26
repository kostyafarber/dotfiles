-- Review pull requests in one checkout, <repo>-review, instead of a worktree per PR.
--
-- Each PR is the local branch review/pr-N (no upstream, so nothing pushes to the PR). review.nvim
-- keeps one comment file per checkout, so switching PRs parks the current PR's comments and
-- reviewed marks under review/parked/<branch>/ and brings back the target's. Edits made in the
-- diff are stashed as "review <branch>" and popped when that PR is opened again.

local M = {}

local data_dir = vim.fn.stdpath("data") .. "/review"

local function run(cmd, cwd)
    local res = vim.system(cmd, { cwd = cwd, text = true }):wait()
    if res.code ~= 0 then
        error(table.concat(cmd, " ") .. ": " .. vim.trim(res.stderr ~= "" and res.stderr or res.stdout), 0)
    end
    return vim.trim(res.stdout)
end

-- review.nvim's storage hash of a checkout path (review/storage.lua).
local function hash(str)
    local h = 0
    for i = 1, #str do
        h = ((h * 31) + string.byte(str, i)) % 2147483647
    end
    return string.format("%x", h)
end

-- The comment and reviewed-mark files review.nvim keeps for checkout `dir`.
local function store_files(dir)
    local h = hash(run({ "git", "rev-parse", "--show-toplevel" }, dir))
    return { data_dir .. "/" .. h .. ".json", data_dir .. "/" .. h .. ".reviewed.json" }
end

local function parked_dir(branch)
    return data_dir .. "/parked/" .. branch:gsub("[^%w%-_]", "_")
end

-- Moves `dir`'s live store files to `branch`'s parking spot, or back with `restore`.
local function move_store(dir, branch, restore)
    local parked = parked_dir(branch)
    vim.fn.mkdir(parked, "p")
    for _, live in ipairs(store_files(dir)) do
        local spot = parked .. "/" .. vim.fs.basename(live):gsub("^%x+", "store")
        local from, to = live, spot
        if restore then from, to = spot, live end
        if vim.uv.fs_stat(from) then
            assert(vim.uv.fs_rename(from, to))
        elseif restore then
            os.remove(to)
        end
    end
end

local function stash_ref(dir, branch)
    local list = run({ "git", "stash", "list", "--format=%gd%x09%s" }, dir)
    for line in list:gmatch("[^\n]+") do
        local ref, subject = line:match("^(%S+)\t(.*)$")
        if subject and subject:sub(-#("review " .. branch)) == "review " .. branch then return ref end
    end
end

-- Closes an open review without exporting or clearing it; its comments stay on disk.
local function close_open_review()
    local hooks = require("review.hooks")
    local tab = hooks.get_current_tabpage()
    if not tab then return end
    vim.api.nvim_set_current_tabpage(tab)
    vim.cmd("tabclose")
    hooks.on_session_closed()
end

-- Once codediff has listed the files, moves past the first one if it is already reviewed.
local function resume(tab, attempts)
    local explorer = require("review.hooks").get_explorer(tab)
    local ok, files = pcall(function() return require("codediff.ui.explorer.tree").get_all_files(explorer.tree) end)
    if not (ok and files and #files > 0 and explorer.data.current_file_path) then
        if attempts > 0 then vim.defer_fn(function() resume(tab, attempts - 1) end, 100) end
        return
    end
    local reviewed = require("review.reviewed")
    for _, entry in ipairs(files) do
        local file = entry.data
        if file.path == explorer.data.current_file_path and file.group == explorer.data.current_file_group then
            if reviewed.is_reviewed(explorer, file) then reviewed.skip_to_unreviewed(explorer, "next") end
            return
        end
    end
end

-- Where PR `pr`'s head and base are kept locally, and the refspecs that update them.
local function refs(pr)
    local head = pr.isCrossRepository and ("refs/remotes/origin/pr/" .. pr.number)
        or ("refs/remotes/origin/" .. pr.headRefName)
    local head_src = pr.isCrossRepository and ("pull/" .. pr.number .. "/head") or pr.headRefName
    local base = "refs/remotes/origin/" .. pr.baseRefName
    return head, base, { "+" .. head_src .. ":" .. head, "+" .. pr.baseRefName .. ":" .. base }
end

local function sha(dir, ref)
    local res = vim.system({ "git", "rev-parse", "--verify", "--quiet", ref .. "^{commit}" }, { cwd = dir, text = true })
        :wait()
    return res.code == 0 and vim.trim(res.stdout) or nil
end

-- The worktree that has `branch` checked out, if any.
local function holder(root, branch)
    local path
    for line in run({ "git", "worktree", "list", "--porcelain" }, root):gmatch("[^\n]+") do
        path = line:match("^worktree (.+)$") or path
        if line == "branch refs/heads/" .. branch then return path end
    end
end

-- The Rex pane running a dev app from the review checkout, which a PR switch closes.
local app_block

-- Closes the pane {@link M.run_app} opened, so an app never runs on a half-switched checkout.
local function stop_app()
    if not app_block then return end
    vim.system({ "rex", "block", "close", app_block }):wait()
    app_block = nil
end

-- Puts `branch` at `target`, carrying uncommitted edits across.
local function move_branch(dir, branch, target)
    local dirty = run({ "git", "status", "--porcelain" }, dir) ~= ""
    if dirty then run({ "git", "stash", "push", "-u", "-m", "review " .. branch }, dir) end
    run({ "git", "checkout", "-q", "-B", branch, "--no-track", target }, dir)
    if dirty then run({ "git", "stash", "pop", "-q" }, dir) end
end

-- Opens `branch` of checkout `dir` in review.nvim against `base_ref`, at the first file not yet
-- marked reviewed.
local function show(dir, branch, base_ref)
    -- The review's tab inherits this tab's directory when codediff opens it; this tab then
    -- goes back to where it was.
    local win, previous = vim.api.nvim_get_current_win(), vim.fn.getcwd()
    vim.api.nvim_create_autocmd("TabNew", {
        once = true,
        callback = vim.schedule_wrap(function()
            if vim.api.nvim_win_is_valid(win) then
                vim.api.nvim_win_call(win, function() vim.cmd.tcd(previous) end)
            end
        end),
    })
    vim.cmd.tcd(dir)
    vim.cmd({ cmd = "Review", args = { "branch", branch, (base_ref:gsub("^refs/remotes/", "")) } })
    -- codediff opens its tab and lists the files asynchronously, then selects the first one.
    vim.api.nvim_create_autocmd("User", {
        pattern = "CodeDiffFileSelect",
        once = true,
        callback = function()
            local tab = vim.api.nvim_get_current_tabpage()
            vim.defer_fn(function() resume(tab, 20) end, 100)
        end,
    })
end

---Checks PR `pr` out in the review checkout, carrying each PR's comments and edits, and opens
---it in review.nvim in this nvim at the first file not yet marked reviewed.
---
---Opens from the PR as last fetched when there is a copy, and fetches in the background; new
---commits are reported, and taken the next time the PR is opened. Only a PR never fetched
---waits on the network.
---@param pr { number: integer, headRefName: string, baseRefName: string, isCrossRepository: boolean }
---@param root string the repository's main checkout
function M.open(pr, root)
    local n = pr.number
    local dir = root .. "-review"
    local branch = "review/pr-" .. n
    local head_ref, base_ref, refspecs = refs(pr)
    local fetch = vim.list_extend({ "git", "fetch", "-q", "origin" }, refspecs)

    -- The look skill's review-pr gives a PR its own worktree on the same branch name, and git
    -- won't check a branch out twice; review the PR there instead, as that worktree has it.
    local elsewhere = holder(root, branch)
    if elsewhere and elsewhere ~= vim.fs.normalize(dir) then
        close_open_review()
        return show(elsewhere, branch, base_ref)
    end

    if not vim.uv.fs_stat(dir) then
        run({ "git", "worktree", "add", "-q", "--detach", dir, base_ref }, root)
    end

    local fetched = false
    if not (sha(dir, head_ref) and sha(dir, base_ref)) then
        run(fetch, dir)
        fetched = true
    end
    local head_sha = sha(dir, head_ref)

    local current = run({ "git", "branch", "--show-current" }, dir)
    if current ~= branch then
        close_open_review()
        stop_app()
        if current ~= "" then
            if run({ "git", "status", "--porcelain" }, dir) ~= "" then
                run({ "git", "stash", "push", "-u", "-m", "review " .. current }, dir)
            end
            move_store(dir, current, false)
        end

        run({ "git", "checkout", "-q", "-B", branch, "--no-track", head_sha }, dir)

        local stash = stash_ref(dir, branch)
        if stash then run({ "git", "stash", "pop", "-q", stash }, dir) end
        move_store(dir, branch, true)
        require("review.store").reset()
        require("review.reviewed").reset()
        vim.system({ "pnpm", "install", "--frozen-lockfile", "--prefer-offline", "--reporter=silent" },
            { cwd = dir, detach = true })
    elseif sha(dir, "HEAD") ~= head_sha then
        -- The PR moved since this review last opened.
        close_open_review()
        stop_app()
        move_branch(dir, branch, head_sha)
    end

    if not fetched then
        vim.system(fetch, { cwd = dir, text = true }, vim.schedule_wrap(function(res)
            if res.code == 0 and sha(dir, head_ref) ~= head_sha then
                vim.notify(("PR #%d has new commits; open it again to review them"):format(n),
                    vim.log.levels.INFO, { title = "Review" })
            end
        end))
    end

    show(dir, branch, base_ref)
end

---Runs the repo's default dev app (dev-app) from this tab's checkout in a Rex pane below, so edits
---made in the review hot-reload into it. Opening a different PR closes the pane.
function M.run_app()
    if app_block then stop_app() end
    local dir = run({ "git", "rev-parse", "--show-toplevel" }, vim.fn.getcwd())
    local cmd = { "rex", "split", "--split=below", "--ratio", "35", "-c", dir }
    if vim.env.REX_BLOCK then vim.list_extend(cmd, { "-b", vim.env.REX_BLOCK }) end
    app_block = run(vim.list_extend(cmd, { "--", vim.fn.expand("~/.dotfiles/work/bin/dev-app") }), dir)
end

-- The last PR list per repository, so the picker opens at once while it refreshes.
local cache_file = vim.fn.stdpath("cache") .. "/review-prs.json"

local function read_cache()
    local ok, data = pcall(function() return vim.json.decode(table.concat(vim.fn.readfile(cache_file), "\n")) end)
    return ok and type(data) == "table" and data or {}
end

local function to_items(prs)
    return vim.tbl_map(function(pr)
        return {
            text = ("#%d %s %s"):format(pr.number, pr.title, pr.author.login),
            pr = pr,
            preview = { text = ("# %s\n\n#%d · @%s%s\n\n%s"):format(pr.title, pr.number, pr.author.login,
                pr.isDraft and " · draft" or "", pr.body or ""), ft = "markdown" },
        }
    end, prs)
end

---Open PRs in a picker; <cr> reviews the chosen one with {@link M.open}. Shows the last list
---straight away and swaps in GitHub's answer when it arrives.
---@param root string the repository's main checkout
function M.pick(root)
    local cache = read_cache()
    local prs = cache[root] or {}
    local picker = Snacks.picker({
        title = "Pull Requests",
        finder = function() return to_items(prs) end,
        format = function(item)
            local pr = item.pr
            return {
                { ("#%-5d"):format(pr.number), "SnacksPickerLabel" },
                { pr.title },
                { "  @" .. pr.author.login, "SnacksPickerComment" },
                pr.isDraft and { "  draft", "SnacksPickerDimmed" } or nil,
            }
        end,
        preview = "preview",
        confirm = function(p, item)
            p:close()
            if not item then return end
            local ok, err = pcall(M.open, item.pr, root)
            if not ok then vim.notify(err, vim.log.levels.ERROR, { title = "Review PR #" .. item.pr.number }) end
        end,
    })
    vim.system({ "gh", "pr", "list", "--limit", "50", "--json", "number,title,author,isDraft,body,headRefName,baseRefName,isCrossRepository" },
        { cwd = root, text = true }, vim.schedule_wrap(function(res)
            if res.code ~= 0 then
                vim.notify(vim.trim(res.stderr), vim.log.levels.ERROR, { title = "gh pr list" })
                return
            end
            prs = vim.json.decode(res.stdout)
            cache[root] = prs
            vim.fn.writefile({ vim.json.encode(cache) }, cache_file)
            if not picker.closed then picker:find() end
        end))
end

return M
