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
        -- No sticky headings in the journal (core/journal.lua).
        on_attach = function(buf) return not require("core/journal").is_journal(buf) end,
    },
    keys = {
        { "<leader>uc", function() require("treesitter-context").toggle() end, desc = "Toggle sticky context" },
    },
}
