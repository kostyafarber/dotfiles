return {
    "f-person/git-blame.nvim",
    event = { "BufReadPre", "BufNewFile" },
    config = function()
        require("gitblame").setup()
        vim.keymap.set("n", "<leader>gB", "<cmd>GitBlameToggle<CR>", { desc = "Toggle inline blame" })
    end,
}
