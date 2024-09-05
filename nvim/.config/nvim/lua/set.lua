vim.opt.nu = true
vim.opt.relativenumber = true

vim.wo.relativenumber = true
vim.api.nvim_set_option("clipboard", "unnamed")

vim.o.tabstop = 4 -- A TAB character looks like 4 spaces
vim.o.expandtab = true -- Pressing the TAB key will insert spaces instead of a TAB character
vim.o.softtabstop = 4 -- Number of spaces inserted instead of a TAB character
vim.o.shiftwidth = 4 -- Number of spaces inserted when indenting

vim.o.incsearch = true

local cmd = vim.cmd

-- Highlight on yank
cmd [[
    augroup highlight_yank
        autocmd!
        autocmd TextYankPost * silent! lua vim.highlight.on_yank { higroup="IncSearch", timeout=100}
    augroup END
]]

