return {
    "ThePrimeagen/harpoon",
    branch = "harpoon2",
    dependencies = { "nvim-lua/plenary.nvim" },
    config = function()
        local harpoon = require("harpoon")
        harpoon:setup({
            settings = {
                save_on_toggle = false,
                sync_on_ui_close = true,
                key = function() return vim.loop.cwd() end,
            },
        })

        vim.keymap.set("n", "<leader>a", function() harpoon:list():add() end,
            { desc = "Harpoon add file" })
        vim.keymap.set("n", "<leader>h", function() harpoon.ui:toggle_quick_menu(harpoon:list()) end,
            { desc = "Harpoon menu" })

        for i = 1, 4 do
            vim.keymap.set("n", "<leader>" .. i,
                function() harpoon:list():select(i) end,
                { desc = "Harpoon file " .. i })
        end

        vim.keymap.set("n", "<leader>hp", function() harpoon:list():prev() end,
            { desc = "Harpoon prev" })
        vim.keymap.set("n", "<leader>hn", function() harpoon:list():next() end,
            { desc = "Harpoon next" })
    end,
}
