return {
    "nvim-treesitter/nvim-treesitter-context",
    event = { "BufReadPre", "BufNewFile" },
    opts = {
        max_lines = 4,
        min_window_height = 20,
        multiline_threshold = 1,
        trim_scope = "outer",
        mode = "cursor",
        separator = nil,
    },
    keys = {
        { "<leader>uc", function() require("treesitter-context").toggle() end, desc = "Toggle sticky context" },
    },
}
