return {
    "brenton-leighton/multiple-cursors.nvim",
    version = "*",
    event = "VeryLazy",
    opts = {},
    keys = {
        { "<C-Down>",  "<cmd>MultipleCursorsAddDown<cr>",            mode = { "n", "x" }, desc = "Add cursor below" },
        { "<C-Up>",    "<cmd>MultipleCursorsAddUp<cr>",              mode = { "n", "x" }, desc = "Add cursor above" },
        { "<C-n>",     "<cmd>MultipleCursorsAddJumpNextMatch<cr>",   mode = { "n", "x" }, desc = "Add cursor at next match" },
        { "<C-S-n>",   "<cmd>MultipleCursorsJumpNextMatch<cr>",      mode = { "n", "x" }, desc = "Skip current match" },
        { "<leader>m", "<cmd>MultipleCursorsAddMatches<cr>",         mode = { "n", "x" }, desc = "Add cursor at all matches in selection" },
        { "mc",        "<cmd>MultipleCursorsAddVisualArea<cr>",      mode = "x",          desc = "Cursor on each visual line" },
        { "<C-LeftMouse>", "<cmd>MultipleCursorsMouseAddDelete<cr>", mode = { "n", "x" }, desc = "Add/remove cursor with mouse" },
    },
}
