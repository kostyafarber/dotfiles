return {
    "folke/snacks.nvim",
    priority = 1000,
    lazy = false,
    opts = {
        bigfile = { enabled = true },
        quickfile = { enabled = true },
        notifier = { enabled = true, timeout = 3000 },
        indent = { enabled = true },
        scroll = { enabled = true },
        statuscolumn = { enabled = true },
        words = { enabled = true },
        dashboard = { enabled = true },
        explorer = { enabled = true, replace_netrw = true },
        picker = {
            enabled = true,
            win = {
                input = {
                    keys = {
                        ["-"] = { "edit_split", mode = { "n" } },
                        ["\\"] = { "edit_vsplit", mode = { "n" } },
                    },
                },
            },
            sources = {
                explorer = {
                    layout = { preset = "sidebar", layout = { position = "right" } },
                },
                lines = {
                    layout = { preset = "default" },
                },
            },
        },
        lazygit = { enabled = true },
        terminal = { enabled = true },
        bufdelete = { enabled = true },
        gitbrowse = { enabled = true },
        input = { enabled = true },
    },
    keys = {
        { "<leader>ff", function() Snacks.picker.files() end,         desc = "Find files" },
        { "<leader>fg", function() Snacks.picker.grep() end,          desc = "Live grep" },
        { "<leader>fl", function() Snacks.picker.lines() end,         desc = "Lines (current buffer)" },
        { "<leader>fw", function() Snacks.picker.grep_word() end,     desc = "Grep word / selection", mode = { "n", "x" } },
        { "<leader>fb", function() Snacks.picker.buffers() end,       desc = "Buffers" },
        { "<leader>fr", function() Snacks.picker.recent() end,        desc = "Recent files" },
        { "<leader>fc", function() Snacks.picker.command_history() end, desc = "Command history" },
        { "<leader>fk", function() Snacks.picker.keymaps() end,       desc = "Keymaps" },
        { "<leader>uC", function() Snacks.picker.colorschemes() end,  desc = "Colorschemes (live preview)" },
        { "<leader>fh", function() Snacks.picker.help() end,          desc = "Help" },
        { "<leader>fs", function() Snacks.picker.lsp_symbols() end,   desc = "Document symbols" },
        { "<leader>fS", function() Snacks.picker.lsp_workspace_symbols() end, desc = "Workspace symbols" },
        { "<leader>ft", function() Snacks.picker.todo_comments() end, desc = "Todos" },
        { "<leader>fd", function() Snacks.picker.diagnostics_buffer() end, desc = "Diagnostics (buffer)" },
        { "<leader>fD", function() Snacks.picker.diagnostics() end,        desc = "Diagnostics (workspace)" },

        { "<leader>gg", function() Snacks.lazygit() end,                desc = "Lazygit" },
        { "<leader>gB", function() Snacks.gitbrowse() end,              desc = "Git browse (open in browser)" },
        { "<leader>gb", function() Snacks.git.blame_line() end,         desc = "Git blame line" },
        { "<leader>gl", function() Snacks.picker.git_log() end,         desc = "Git log" },
        { "<leader>gs", function() Snacks.picker.git_status() end,      desc = "Git status" },

        { "<leader>nh", function() Snacks.notifier.show_history() end,  desc = "Notification history" },
        { "<leader>e",  function() Snacks.explorer() end,               desc = "Explorer" },
        { "<leader>`",  function() Snacks.terminal() end,               desc = "Toggle terminal" },
        { "<leader>bd", function()
            local bufnr = vim.api.nvim_get_current_buf()
            if #vim.api.nvim_tabpage_list_wins(0) > 1 then
                vim.cmd("close")
            end
            Snacks.bufdelete(bufnr)
        end, desc = "Delete buffer + close split" },
    },
}
