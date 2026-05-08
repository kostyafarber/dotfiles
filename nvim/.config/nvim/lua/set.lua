vim.opt.nu = true
vim.opt.relativenumber = true
vim.wo.relativenumber = true
vim.opt.clipboard = "unnamed"

vim.o.tabstop = 4
vim.o.expandtab = true
vim.o.softtabstop = 4
vim.o.shiftwidth = 4

vim.opt.autoindent = true
vim.opt.breakindent = true

vim.env.PRETTIERD_LOCAL_PRETTIER_ONLY = "1"

vim.o.incsearch = true

vim.opt.mouse = "a"
vim.opt.mousemoveevent = true
vim.opt.termguicolors = true
vim.opt.signcolumn = "yes"
vim.opt.cursorline = true
vim.opt.scrolloff = 8
vim.opt.splitbelow = true
vim.opt.splitright = true
vim.opt.updatetime = 250

vim.keymap.set({ "v", "o" }, "ah", "at", { desc = "Around HTML tag" })

vim.api.nvim_create_autocmd("TextYankPost", {
    group = vim.api.nvim_create_augroup("highlight_yank", { clear = true }),
    callback = function()
        vim.highlight.on_yank({ higroup = "IncSearch", timeout = 100 })
    end,
})
