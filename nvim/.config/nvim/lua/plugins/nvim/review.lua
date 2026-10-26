-- Code review in a codediff tab: comments on lines, the right side is the real file (edit in
-- place), and the export goes to the Claude pane. https://github.com/georgeguimaraes/review.nvim

-- Writes the review where Claude can read it, then asks the Claude pane to address it.
-- A file rather than typing the markdown in: multi-line text would submit line by line.
local function send_to_claude(markdown)
    local git_dir = vim.trim(vim.fn.system({ "git", "rev-parse", "--absolute-git-dir" }))
    if vim.v.shell_error ~= 0 then return end
    local path = git_dir .. "/review.md"
    vim.fn.writefile(vim.split(markdown, "\n"), path)
    local ok, rex = pcall(require, "core/rex")
    if vim.env.REX_SESSION and ok and type(rex) == "table" then
        rex.send_to_agent("Address my review in " .. path, true)
    end
end

return {
    {
        "georgeguimaraes/review.nvim",
        version = "*",
        dependencies = { "esmuellert/codediff.nvim", "MunifTanjim/nui.nvim" },
        -- VeryLazy so notes show in plain buffers; cmd so `nvim -c Review` works before that fires.
        event = "VeryLazy",
        cmd = "Review",
        keys = {
            { "<leader>vv", "<cmd>Review<cr>", desc = "Review: working tree" },
            { "<leader>vb", "<cmd>Review branch<cr>", desc = "Review: a branch against its base" },
            { "<leader>vc", "<cmd>Review commits<cr>", desc = "Review: pick commits" },
            -- Open PRs; <cr> reviews the PR here, in the repo's one review checkout (review_ext.pr).
            {
                "<leader>vp",
                function()
                    local root = vim.fn.system({ "git", "worktree", "list", "--porcelain" }):match("^worktree ([^\n]+)")
                    if not root then return vim.notify("not in a git repository", vim.log.levels.WARN) end
                    require("review_ext.pr").pick(root)
                end,
                desc = "Review: pick a pull request",
            },
            { "<leader>vn", ":Review note<cr>", mode = { "n", "v" }, desc = "Review: note here" },
            { "<leader>ve", "<cmd>Review edit<cr>", desc = "Review: edit comment" },
            { "<leader>vd", "<cmd>Review delete<cr>", desc = "Review: delete comment" },
            { "<leader>vl", "<cmd>Review list<cr>", desc = "Review: list comments" },
            { "<leader>vs", "<cmd>Review export<cr>", desc = "Review: send to Claude" },
            -- Comment on the line or the selection, in a review or any file. <Tab> in the box picks the type.
            {
                "<leader>cc",
                function() require("review.comments").add_at_cursor() end,
                desc = "Comment on this line",
            },
            {
                "<leader>cc",
                ":<C-u>lua require('review.comments').add_for_range()<cr>",
                mode = "x",
                desc = "Comment on the selection",
            },
            { "<leader>cr", function() require("review_ext").reply_at_cursor() end, desc = "Reply to the comment here" },
            { "<leader>ce", function() require("review.comments").edit_at_cursor() end, desc = "Edit the comment here" },
            { "<leader>cd", function() require("review.comments").delete_at_cursor() end, desc = "Delete the comment here" },
            { "<leader>cv", function() require("review_ext").toggle_viewed() end, desc = "Mark file viewed, go to next" },
            -- In the review's file panel: select rows with V, then mark them all viewed (or unmark).
            {
                "<leader>cv",
                function()
                    local first, last = vim.fn.line("v"), vim.fn.line(".")
                    vim.cmd("normal! \27")
                    require("review_ext").toggle_viewed_rows(first, last)
                end,
                mode = "x",
                desc = "Mark selected files viewed",
            },
            {
                "<leader>cx",
                function() require("review_ext").toggle_resolved_at_cursor() end,
                desc = "Resolve / reopen the comment here",
            },
            {
                "<leader>cR",
                function() require("review_ext").toggle_show_resolved() end,
                desc = "Show / hide resolved comments",
            },
        },
        opts = {
            -- Edit mode: the diff's new side is the file itself. Comment keys are <localleader>c*.
            codediff = { readonly = false },
            export = { on_export = send_to_claude },
        },
        config = function(_, opts)
            require("review").setup(opts)
            -- Hunk-style cards, threads, and the API Claude drives (lua/review_ext).
            require("review_ext").setup()
        end,
    },
    -- The earlier home-grown plugin (review.nvim/ in this config). Off: it also takes the
    -- `review` module name.
    {
        dir = vim.fn.stdpath("config") .. "/review.nvim",
        name = "review-local",
        enabled = false,
    },
}
