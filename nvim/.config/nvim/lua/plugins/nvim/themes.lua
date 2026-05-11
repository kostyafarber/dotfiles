return {
    { "folke/tokyonight.nvim",  lazy = true, priority = 100 },
    { "rose-pine/neovim",       name = "rose-pine", lazy = true, priority = 100 },
    { "rebelot/kanagawa.nvim",  lazy = true, priority = 100 },
    { "ellisonleao/gruvbox.nvim", lazy = true, priority = 100 },
    { "EdenEast/nightfox.nvim", lazy = true, priority = 100 },
    { "mcchrish/zenbones.nvim", dependencies = { "rktjmp/lush.nvim" }, lazy = false, priority = 100 },
    { "yorickpeterse/nvim-grey", lazy = false, priority = 100 },
    { "saeeedhany/parchment.nvim", lazy = false, priority = 100 },
    { "sainnhe/everforest", lazy = false, priority = 100 },
    {
        "zaldih/themery.nvim",
        lazy = false,
        config = function()
            require("themery").setup({
                themes = {
                    { name = "Catppuccin Latte",      colorscheme = "catppuccin-latte" },
                    { name = "Rose Pine Dawn",        colorscheme = "rose-pine-dawn" },
                    { name = "Kanagawa Lotus",        colorscheme = "kanagawa-lotus" },
                    { name = "Dawnfox",               colorscheme = "dawnfox" },
                    { name = "Parchment Manuscript",  colorscheme = "parchment-manuscript" },
                    { name = "Zenbones (light)",      colorscheme = "zenbones",     before = [[vim.opt.background = "light"]] },
                    { name = "Zenwritten (light)",    colorscheme = "zenwritten",   before = [[vim.opt.background = "light"]] },
                    { name = "Rosebones (light)",     colorscheme = "rosebones",    before = [[vim.opt.background = "light"]] },
                    { name = "Forestbones (light)",   colorscheme = "forestbones",  before = [[vim.opt.background = "light"]] },
                    { name = "Everforest (light)",    colorscheme = "everforest",   before = [[vim.opt.background = "light"]] },
                    { name = "Gruvbox (light soft)",  colorscheme = "gruvbox",      before = [[vim.opt.background = "light"; vim.g.gruvbox_contrast_light = "soft"]] },
                    { name = "Grey",                  colorscheme = "grey" },
                    { name = "Catppuccin Mocha",      colorscheme = "catppuccin-mocha" },
                    { name = "Tokyonight Night",      colorscheme = "tokyonight-night" },
                    { name = "Rose Pine",             colorscheme = "rose-pine" },
                    { name = "Kanagawa Wave",         colorscheme = "kanagawa-wave" },
                },
                livePreview = true,
            })
            vim.keymap.set("n", "<leader>ut", "<cmd>Themery<cr>", { desc = "Theme picker (persistent)" })
        end,
    },
}
