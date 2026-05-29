local function search_diff_text()
    Snacks.picker.git_diff({
        title = "Git diff search (unstaged)",
        group = false,
        staged = false,
        win = {
            input = {
                keys = {
                    ["<Tab>"] = { "confirm", mode = { "i", "n" } },
                },
            },
            list = {
                keys = {
                    ["<Tab>"] = "confirm",
                },
            },
        },
    })
end

return {
    "sindrets/diffview.nvim",
    cmd = { "DiffviewOpen", "DiffviewClose", "DiffviewFileHistory", "DiffviewToggleFiles", "DiffviewFocusFiles" },
    opts = function()
        return {
            enhanced_diff_hl = false,
            show_help_hints = false,
            view = {
                default = {
                    layout = "diff2_horizontal",
                    disable_diagnostics = true,
                    winbar_info = true,
                },
                file_history = {
                    layout = "diff2_horizontal",
                    disable_diagnostics = true,
                    winbar_info = true,
                },
            },
            file_panel = {
                listing_style = "tree",
                tree_options = {
                    flatten_dirs = true,
                    folder_statuses = "always",
                },
                win_config = {
                    position = "left",
                    width = 42,
                },
            },
            hooks = {
                diff_buf_read = function()
                    vim.opt_local.scrollbind = true
                    vim.opt_local.cursorbind = true
                    vim.opt_local.wrap = false
                    vim.opt_local.list = false
                end,
            },
        }
    end,
    keys = {
        {
            "<leader>gd",
            function()
                if require("diffview.lib").get_current_view() then
                    vim.cmd("DiffviewClose")
                else
                    vim.cmd("DiffviewOpen")
                end
            end,
            desc = "Diffview: review agent changes (unstaged)",
        },
        {
            "<leader>gD",
            function()
                if require("diffview.lib").get_current_view() then
                    vim.cmd("DiffviewClose")
                else
                    vim.cmd("DiffviewOpen HEAD")
                end
            end,
            desc = "Diffview: everything vs HEAD (commit review)",
        },
        { "<leader>gh", "<cmd>DiffviewFileHistory<cr>", desc = "Diffview: repo history" },
        { "<leader>gH", "<cmd>DiffviewFileHistory %<cr>", desc = "Diffview: this file's history" },
        { "<leader>gS", "<cmd>DiffviewOpen --cached<cr>", desc = "Diffview: staged only" },
        { "<leader>gm", "<cmd>DiffviewOpen origin/main...HEAD<cr>", desc = "Diffview: branch vs origin/main (PR view)" },
        { "<leader>ge", "<cmd>DiffviewFocusFiles<cr>", desc = "Diffview: focus files" },
        { "<leader>g/", search_diff_text, desc = "Git: search diff text" },
    },
}
