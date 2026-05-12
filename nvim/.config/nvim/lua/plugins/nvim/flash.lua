return {
    "folke/flash.nvim",
    event = "VeryLazy",
    opts = {
        modes = {
            search = { enabled = true },
            char = { enabled = true, jump_labels = true },
        },
    },
    init = function()
        local set_flash_hl = function()
            vim.api.nvim_set_hl(0, "FlashLabel", { fg = "#1e1e2e", bg = "#ff79c6", bold = true })
            vim.api.nvim_set_hl(0, "FlashMatch", { fg = "#ffffff", bg = "#44475a", bold = true })
            vim.api.nvim_set_hl(0, "FlashCurrent", { fg = "#1e1e2e", bg = "#f1fa8c", bold = true })
        end
        set_flash_hl()
        vim.api.nvim_create_autocmd("ColorScheme", { callback = set_flash_hl })
    end,
    keys = {
        { "s", mode = { "n", "x", "o" }, function() require("flash").jump() end, desc = "Flash" },
        { "S", mode = { "n", "x", "o" }, function() require("flash").treesitter() end, desc = "Flash Treesitter" },
        { "r", mode = "o", function() require("flash").remote() end, desc = "Remote Flash" },
        { "R", mode = { "o", "x" }, function() require("flash").treesitter_search() end, desc = "Treesitter Search" },
        { "<c-s>", mode = { "c" }, function() require("flash").toggle() end, desc = "Toggle Flash Search" },
    },
}
