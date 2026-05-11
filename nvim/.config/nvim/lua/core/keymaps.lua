vim.g.mapleader = " "

local k = vim.keymap.set

k("n", "<C-d>", "<C-d>zz")
k("n", "<C-u>", "<C-u>zz")

k("n", "<leader>w", "<cmd>update<cr>", { desc = "Save" })
k("n", "<leader>qq", "<cmd>xa<cr>", { desc = "Save all and quit" })

k("n", "<leader>-", "<cmd>split<cr>",  { desc = "Split horizontal" })
k("n", "<leader>|", "<cmd>vsplit<cr>", { desc = "Split vertical" })

k("n", "]q", "<cmd>cnext<CR>zz", { desc = "Next quickfix" })
k("n", "[q", "<cmd>cprev<CR>zz", { desc = "Prev quickfix" })
k("n", "]Q", "<cmd>clast<CR>zz", { desc = "Last quickfix" })
k("n", "[Q", "<cmd>cfirst<CR>zz", { desc = "First quickfix" })
k("n", "]l", "<cmd>lnext<CR>zz", { desc = "Next loclist" })
k("n", "[l", "<cmd>lprev<CR>zz", { desc = "Prev loclist" })

k("x", "*", [[y/\V<C-R>=escape(@",'/\')<CR><CR>]], { desc = "Search selection forward" })
k("x", "#", [[y?\V<C-R>=escape(@",'?\')<CR><CR>]], { desc = "Search selection backward" })

k("i", "<M-Right>", "<C-Right>", { desc = "Word forward" })
k("i", "<M-Left>",  "<C-Left>",  { desc = "Word back" })
k("i", "<M-BS>",    "<C-w>",     { desc = "Delete word back" })

k({ "i", "n", "v" }, "<S-Right>", "<S-Right>")
k({ "i", "n", "v" }, "<S-Left>",  "<S-Left>")

local function open_explorer()
    if package.loaded["snacks"] then Snacks.explorer() end
end
vim.api.nvim_create_autocmd("VimEnter", {
    callback = function()
        if vim.fn.argc() > 0 then
            vim.schedule(open_explorer)
        end
    end,
})
