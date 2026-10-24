require("set")
require("core/keymaps")
if vim.env.REX_SESSION then require("core/rex") end

local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"

if not vim.loop.fs_stat(lazypath) then
    vim.fn.system({
        "git", "clone", "--filter=blob:none",
        "https://github.com/folke/lazy.nvim.git", "--branch=stable", -- latest stable release
        lazypath
    })
end
vim.opt.rtp:prepend(lazypath)

local spec = {
    {import = "plugins.core"},
    {import = "plugins.nvim"},
    {import = "plugins.nvim.lsp"}
}

-- Work-only plugins live in a private repo at ~/.dotfiles/work, outside this one.
local work = vim.fn.expand("~/.dotfiles/work/nvim")
local rtp_paths = {}
if vim.loop.fs_stat(work .. "/lua/work/plugins") then
    vim.opt.rtp:append(work)
    table.insert(rtp_paths, work)
    table.insert(spec, {import = "work.plugins"})
end

require("lazy").setup(spec, { performance = { rtp = { paths = rtp_paths } } })
