return {
    "saghen/blink.cmp",
    version = "1.*",
    event = "InsertEnter",
    dependencies = {
        "rafamadriz/friendly-snippets",
        "fang2hou/blink-copilot",
    },
    opts = {
        keymap = {
            preset = "super-tab",
            ["<C-j>"] = { "select_next", "fallback" },
            ["<C-k>"] = { "select_prev", "fallback" },
            ["<C-Space>"] = { "show", "show_documentation", "hide_documentation" },
            ["<C-e>"] = { "hide", "fallback" },
            ["<C-b>"] = { "scroll_documentation_up", "fallback" },
            ["<C-f>"] = { "scroll_documentation_down", "fallback" },
        },
        appearance = {
            nerd_font_variant = "mono",
        },
        sources = {
            default = { "lsp", "path", "snippets", "buffer", "copilot" },
            providers = {
                copilot = {
                    name = "copilot",
                    module = "blink-copilot",
                    async = true,
                    score_offset = 100,
                },
            },
        },
        completion = {
            documentation = { auto_show = true, auto_show_delay_ms = 200 },
            ghost_text = { enabled = true },
        },
        signature = { enabled = true },
    },
    opts_extend = { "sources.default" },
}
