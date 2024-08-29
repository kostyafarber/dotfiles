vim.g.mapleader = " "

local keymap = vim.keymap

keymap.set("n", "<leader>w", "<C-w>w")

keymap.set("n", "<C-d>", "<C-d>zz")
keymap.set("n", "<C-u>", "<C-u>zz")
