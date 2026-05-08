return {
    "catppuccin/nvim",
    name = "catppuccin",
    lazy = false,
    priority = 1000,
    opts = {
        flavour = "latte",
        integrations = {
            blink_cmp = true,
            gitsigns = true,
            mason = true,
            snacks = { enabled = true, indent_scope_color = "lavender" },
            treesitter = true,
            which_key = true,
            lsp_trouble = true,
            telescope = { enabled = false },
            native_lsp = { enabled = true, inlay_hints = { background = true } },
        },
    },
    config = function(_, opts)
        require("catppuccin").setup(opts)
        vim.cmd.colorscheme("catppuccin-latte")
    end,
}
