-- VSCode-style side-by-side diff with character-level highlighting.
-- Sits alongside diffview: <leader>gd stays diffview, <leader>gc is codediff.
-- Inside a view: ]c/[c hunks, ]f/[f files, t toggles inline, q quits.

-- Windows of a codediff tab that show file contents (not the explorer/history panel).
local function diff_wins(tabpage)
    local wins = {}
    for _, win in ipairs(vim.api.nvim_tabpage_list_wins(tabpage)) do
        local ft = vim.bo[vim.api.nvim_win_get_buf(win)].filetype
        if not ft:match("^codediff%-") then
            table.insert(wins, win)
        end
    end
    return wins
end

-- Buffers where we switched render-markdown off, so it comes back on close.
local unrendered = {}

local function apply(tabpage)
    if not vim.api.nvim_tabpage_is_valid(tabpage) then return end
    local ok, manager = pcall(require, "render-markdown.core.manager")
    for _, win in ipairs(diff_wins(tabpage)) do
        -- absolute numbers: relative ones are meaningless across two aligned panes
        vim.wo[win].relativenumber = false
        vim.wo[win].number = true
        local buf = vim.api.nvim_win_get_buf(win)
        -- snacks smooth scrolling animates each pane separately and breaks scrollbind
        vim.b[buf].snacks_scroll = false
        -- raw markdown: rendered backticks/links hide what actually changed
        if ok and vim.bo[buf].filetype == "markdown" and manager.attached(buf) then
            manager.set_buf(buf, false)
            unrendered[buf] = true
        end
    end
end

-- The diff windows are (re)built asynchronously after the events fire and
-- render-markdown attaches async on FileType, so apply now and again shortly after.
local function tidy(tabpage)
    apply(tabpage)
    vim.defer_fn(function() apply(tabpage) end, 150)
    vim.defer_fn(function() apply(tabpage) end, 500)
end

local function restore()
    local ok, manager = pcall(require, "render-markdown.core.manager")
    if not ok then return end
    for buf in pairs(unrendered) do
        if vim.api.nvim_buf_is_valid(buf) and manager.attached(buf) then
            manager.set_buf(buf, true)
        end
    end
    unrendered = {}
end

return {
    "esmuellert/codediff.nvim",
    cmd = "CodeDiff",
    keys = {
        { "<leader>gc", "<cmd>CodeDiff<cr>", desc = "CodeDiff: working tree vs HEAD" },
        { "<leader>gC", "<cmd>CodeDiff origin/main<cr>", desc = "CodeDiff: branch vs origin/main (PR view)" },
    },
    opts = {},
    config = function(_, opts)
        require("codediff").setup(opts)
        local group = vim.api.nvim_create_augroup("codediff-tidy", { clear = true })
        vim.api.nvim_create_autocmd("User", {
            group = group,
            pattern = { "CodeDiffOpen", "CodeDiffFileSelect", "CodeDiffVirtualFileLoaded" },
            callback = function(ev)
                local tabpage = ev.data and ev.data.tabpage or vim.api.nvim_get_current_tabpage()
                tidy(tabpage)
            end,
        })
        -- Selecting a file rebuilds the diff windows, which resets window options
        -- from the globals; catch every buffer landing in a codediff tab.
        vim.api.nvim_create_autocmd("BufWinEnter", {
            group = group,
            callback = function()
                local tabpage = vim.api.nvim_get_current_tabpage()
                local ok, lifecycle = pcall(require, "codediff.ui.lifecycle")
                if ok and lifecycle.get_session(tabpage) then
                    tidy(tabpage)
                end
            end,
        })
        vim.api.nvim_create_autocmd("User", {
            group = group,
            pattern = "CodeDiffClose",
            callback = restore,
        })
    end,
}
