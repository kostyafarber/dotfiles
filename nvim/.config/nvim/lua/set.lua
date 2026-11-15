-- Disable netrw entirely. Must run before the netrw plugin is sourced (set.lua
-- is required at the very top of init.lua, before lazy/plugins load). Directory
-- buffers are handled by the dashboard at startup (see snacks.lua) and by oil
-- mid-session (`-` / `<leader>o`).
vim.g.loaded_netrw = 1
vim.g.loaded_netrwPlugin = 1

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

-- scrolloff is for keyboard motions: a click near the top or bottom edge would otherwise scroll the
-- view to keep 8 lines of context. A click turns it off until the next key that isn't the mouse.
local click_ns = vim.api.nvim_create_namespace("click-without-scroll")
vim.keymap.set({ "n", "x" }, "<LeftMouse>", function()
    vim.o.scrolloff = 0
    vim.on_key(function(_, typed)
        local key = vim.fn.keytrans(typed or "")
        if key == "" or key:find("Mouse") or key:find("ScrollWheel") or key:find("Release") or key:find("Drag") then
            return
        end
        vim.on_key(nil, click_ns)
        vim.schedule(function() vim.o.scrolloff = 8 end)
    end, click_ns)
    return "<LeftMouse>"
end, { expr = true, desc = "Click moves the cursor without scrolling the view" })

vim.opt.splitbelow = true
vim.opt.splitright = true
vim.opt.updatetime = 250
vim.opt.guicursor = "n-v-c-sm:block-Cursor,i-ci-ve:ver25-CursorInsert"

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
