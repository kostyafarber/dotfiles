return {
    "NvChad/nvim-colorizer.lua",
    event = { "BufReadPre", "BufNewFile" },
    opts = {
        filetypes = { "*" },
        user_default_options = {
            RGB = true,
            RRGGBB = true,
            names = false,
            RRGGBBAA = true,
            AARRGGBB = true,
            rgb_fn = true,
            hsl_fn = true,
            css = true,
            css_fn = true,
            tailwind = true,
            mode = "virtualtext",
            virtualtext = "■",
            virtualtext_inline = "before",
        },
    },
}
