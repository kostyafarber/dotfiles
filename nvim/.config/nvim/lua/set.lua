vim.opt.nu = true
vim.opt.relativenumber = true

vim.opt.tabstop = 4
vim.opt.incsearch = true

local cmd = vim.cmd

-- Highlight on yank
cmd [[
		augroup highlight_yank
			autocmd!
			autocmd TextYankPost * silent! lua vim.highlight.on_yank { higroup="IncSearch", timeout=100}
		augroup END
]]

