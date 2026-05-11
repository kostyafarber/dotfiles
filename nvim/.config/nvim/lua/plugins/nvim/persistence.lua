return {
    "folke/persistence.nvim",
    lazy = false,
    opts = {},
    keys = {
        { "<leader>qs", function() require("persistence").load() end,                desc = "Restore session for cwd" },
        { "<leader>ql", function() require("persistence").load({ last = true }) end, desc = "Restore last session" },
        { "<leader>qd", function() require("persistence").stop() end,                desc = "Don't save current session" },
    },
    config = function(_, opts)
        require("persistence").setup(opts)
        vim.api.nvim_create_autocmd("VimEnter", {
            group = vim.api.nvim_create_augroup("persistence_autoload", { clear = true }),
            nested = true,
            callback = function()
                if vim.fn.argc() == 0 then
                    require("persistence").load()
                end
            end,
        })
    end,
}
