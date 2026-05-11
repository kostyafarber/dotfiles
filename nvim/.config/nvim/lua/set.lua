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

vim.api.nvim_create_autocmd("FileType", {
    group = vim.api.nvim_create_augroup("two_space_indent", { clear = true }),
    pattern = {
        "typescript",
        "typescriptreact",
        "javascript",
        "javascriptreact",
        "json",
        "jsonc",
        "css",
        "scss",
        "html",
        "yaml",
        "lua",
        "markdown",
    },
    callback = function()
        vim.bo.tabstop = 2
        vim.bo.shiftwidth = 2
        vim.bo.softtabstop = 2
    end,
})

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

vim.opt.fillchars:append({ diff = "╱" })
vim.opt.diffopt:append({ "linematch:60", "algorithm:histogram", "indent-heuristic" })

vim.opt.autoread = true
vim.api.nvim_create_autocmd({ "FocusGained", "BufEnter", "CursorHold", "CursorHoldI" }, {
    group = vim.api.nvim_create_augroup("auto_reload", { clear = true }),
    callback = function()
        if vim.fn.mode() ~= "c" then vim.cmd("checktime") end
    end,
})
vim.api.nvim_create_autocmd("FileChangedShell", {
    group = vim.api.nvim_create_augroup("file_changed_resolve", { clear = true }),
    callback = function(args)
        if vim.fn.getbufvar(args.buf, "&modified") == 0 then
            vim.v.fcs_choice = "reload"
        else
            vim.v.fcs_choice = "ask"
        end
    end,
})

vim.api.nvim_create_autocmd("FileChangedShellPost", {
    callback = function()
        vim.notify("File changed on disk — buffer reloaded", vim.log.levels.WARN)
    end,
})

vim.api.nvim_create_autocmd({ "FocusLost", "BufLeave", "InsertLeave" }, {
    group = vim.api.nvim_create_augroup("auto_save", { clear = true }),
    callback = function()
        if vim.bo.modified and vim.bo.buftype == "" and vim.fn.expand("%") ~= "" then
            vim.cmd("silent! update")
        end
    end,
})

do
    local watcher = vim.uv.new_fs_event()
    if watcher then
        local cwd = vim.uv.cwd()
        watcher:start(cwd, { recursive = true }, vim.schedule_wrap(function(err)
            if err then return end
            vim.cmd("silent! checktime")
        end))
    end
end

vim.keymap.set({ "v", "o" }, "ah", "at", { desc = "Around HTML tag" })

vim.api.nvim_create_autocmd("TextYankPost", {
    group = vim.api.nvim_create_augroup("highlight_yank", { clear = true }),
    callback = function()
        vim.highlight.on_yank({ higroup = "IncSearch", timeout = 100 })
    end,
})
