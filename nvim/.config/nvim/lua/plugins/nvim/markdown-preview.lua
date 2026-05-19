return {
    "selimacerbas/markdown-preview.nvim",
    dependencies = { "selimacerbas/live-server.nvim" },
    cmd = { "MarkdownPreview", "MarkdownPreviewRefresh", "MarkdownPreviewStop" },
    ft = { "markdown" },
    keys = {
        { "<leader>mp", "<cmd>MarkdownPreview<cr>",     desc = "Markdown preview (browser)", ft = "markdown" },
        { "<leader>mr", "<cmd>MarkdownPreviewRefresh<cr>", desc = "Markdown preview refresh", ft = "markdown" },
        { "<leader>ms", "<cmd>MarkdownPreviewStop<cr>", desc = "Markdown preview stop",     ft = "markdown" },
    },
    config = function()
        require("markdown_preview").setup({
            instance_mode = "takeover",
            port = 0,
            open_browser = true,
            debounce_ms = 300,
        })
    end,
}
