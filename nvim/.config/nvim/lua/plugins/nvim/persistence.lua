return {
    "folke/persistence.nvim",
    lazy = false,
    opts = {},
    keys = {
        { "<leader>qs", function() require("persistence").load() end,                desc = "Restore session for cwd" },
        { "<leader>ql", function() require("persistence").load({ last = true }) end, desc = "Restore last session" },
        { "<leader>qd", function() require("persistence").stop() end,                desc = "Don't save current session" },
    },
    config = function(_, opts)
        require("persistence").setup(opts)
    end,
}
