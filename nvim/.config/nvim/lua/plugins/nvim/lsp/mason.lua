return {
    "williamboman/mason.nvim",
    version = "^1.0.0",
    dependencies = { "WhoIsSethDaniel/mason-tool-installer.nvim" },
    event = "VeryLazy",
    build = ":MasonUpdate",
    config = function()
        require("mason").setup({
            ui = {
                icons = {
                    package_installed = "✓",
                    package_pending = "➜",
                    package_uninstalled = "✗",
                },
            },
        })
        require("mason-tool-installer").setup({
            ensure_installed = {
                "typescript-language-server",
                "lua-language-server",
                "html-lsp",
                "css-lsp",
                "tailwindcss-language-server",
                "svelte-language-server",
                "graphql-language-service-cli",
                "emmet-ls",
                "prisma-language-server",
                "pyright",
                "prettierd",
                "stylua",
                "ruff",
                "eslint_d",
            },
            auto_update = false,
            run_on_start = true,
        })
    end,
}
