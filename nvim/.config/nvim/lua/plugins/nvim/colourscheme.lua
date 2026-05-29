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
                DiffAdd     = { bg = "#dafbe1" },
                DiffChange  = { bg = "#dafbe1" },
                DiffDelete  = { bg = "#ffebe9", fg = "#82071e" },
                DiffText    = { bg = "#aceebb", bold = true },

                GitSignsAdd        = { fg = "#1a7f37" },
                GitSignsChange     = { fg = "#9a6700" },
                GitSignsDelete     = { fg = "#cf222e" },

                DiffviewDiffAdd         = { bg = "#dafbe1" },
                DiffviewDiffChange      = { bg = "#dafbe1" },
                DiffviewDiffDelete      = { bg = "#ffebe9", fg = "#82071e" },
                DiffviewDiffText        = { bg = "#aceebb", bold = true },
                DiffviewDiffAddAsDelete = { bg = "#ffebe9" },
                DiffviewDiffDeleteText  = { bg = "#ffaba8", bold = true },
            }
        end,
    },
    config = function(_, opts)
        require("catppuccin").setup(opts)
        vim.cmd.colorscheme("catppuccin")
    end,
}
