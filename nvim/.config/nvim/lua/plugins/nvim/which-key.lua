return {
    "folke/which-key.nvim",
    event = "VeryLazy",
    opts = {
        preset = "modern",
        spec = {
            { "<leader>f", group = "find" },
            { "<leader>g", group = "git" },
            { "<leader>h", group = "hunk" },
            { "<leader>x", group = "trouble" },
            { "<leader>r", group = "rename/restart" },
            { "<leader>c", group = "code" },
            { "<leader>n", group = "notify" },
            { "<leader>b", group = "buffer" },
        },
    },
}
