return {
    "catppuccin/nvim",
    name = "catppuccin",
    lazy = false,
    priority = 1000,
    opts = {
        flavour = "latte",
        integrations = {
            blink_cmp = true,
            diffview = true,
            gitsigns = true,
            mason = true,
            snacks = { enabled = true, indent_scope_color = "lavender" },
            treesitter = true,
            which_key = true,
            lsp_trouble = true,
            telescope = { enabled = false },
            native_lsp = { enabled = true, inlay_hints = { background = true } },
        },
        custom_highlights = function(C)
            return {
                DiffAdd     = { bg = "#dcfce7" },
                DiffChange  = { bg = "#fef9c3" },
                DiffDelete  = { bg = "#fecaca", fg = "#991b1b" },
                DiffText    = { bg = "#86efac", bold = true },

                GitSignsAdd        = { fg = "#16a34a" },
                GitSignsChange     = { fg = "#ca8a04" },
                GitSignsDelete     = { fg = "#dc2626" },

                DiffviewDiffAddAsDelete = { bg = "#fecaca" },
                DiffviewDiffDelete      = { fg = C.surface1 },
            }
        end,
    },
    config = function(_, opts)
        require("catppuccin").setup(opts)
        vim.cmd.colorscheme("catppuccin")
    end,
}
