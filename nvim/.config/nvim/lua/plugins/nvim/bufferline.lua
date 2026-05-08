return {
    "akinsho/bufferline.nvim",
    version = "*",
    dependencies = { "nvim-tree/nvim-web-devicons" },
    event = "VeryLazy",
    opts = {
        options = {
            mode = "buffers",
            diagnostics = "nvim_lsp",
            offsets = {
                { filetype = "snacks_layout_box", text = "Explorer", separator = true },
            },
            show_buffer_close_icons = true,
            show_close_icon = false,
            separator_style = "slant",
        },
    },
    keys = {
        { "<S-h>",      "<cmd>BufferLineCyclePrev<cr>",   desc = "Prev buffer" },
        { "<S-l>",      "<cmd>BufferLineCycleNext<cr>",   desc = "Next buffer" },
        { "<leader>bp", "<cmd>BufferLineTogglePin<cr>",   desc = "Pin buffer" },
        { "<leader>bo", "<cmd>BufferLineCloseOthers<cr>", desc = "Close other buffers" },
    },
}
