return {
    "sindrets/diffview.nvim",
    cmd = { "DiffviewOpen", "DiffviewClose", "DiffviewFileHistory", "DiffviewToggleFiles" },
    keys = {
        {
            "<leader>gd",
            function()
                if require("diffview.lib").get_current_view() then
                    vim.cmd("DiffviewClose")
                else
                    vim.cmd("DiffviewOpen")
                end
            end,
            desc = "Diffview: toggle changes vs HEAD",
        },
        { "<leader>gh", "<cmd>DiffviewFileHistory<cr>", desc = "Diffview: repo history" },
        { "<leader>gH", "<cmd>DiffviewFileHistory %<cr>", desc = "Diffview: this file's history" },
    },
}
