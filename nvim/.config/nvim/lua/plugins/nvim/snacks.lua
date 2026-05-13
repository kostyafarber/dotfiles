local function set_pi_hl()
    vim.api.nvim_set_hl(0, "PiBlue", { fg = "#4c60e6", bold = true })
    vim.api.nvim_set_hl(0, "PiShadow", { fg = "#2a2a2a" })
    vim.api.nvim_set_hl(0, "PiMeta", { fg = "#404040" })
    vim.api.nvim_set_hl(0, "PiDivider", { fg = "#404040" })
    vim.api.nvim_set_hl(0, "SnacksDashboardIcon", { link = "Normal" })
    vim.api.nvim_set_hl(0, "SnacksDashboardKey", { link = "Normal" })
    vim.api.nvim_set_hl(0, "SnacksDashboardDesc", { fg = "#4c60e6" })
end
set_pi_hl()
vim.api.nvim_create_autocmd("ColorScheme", { callback = set_pi_hl })

local function pi_divider()
    local dash = string.rep("─", 25)
    return {
        { dash .. " ", hl = "PiDivider" },
        { "◆", hl = "PiBlue" },
        { " " .. dash, hl = "PiDivider" },
    }
end

local function pi_header()
    local LOGO_WIDTH = 18
    local INNER = 50
    local PAD = math.floor((INNER - LOGO_WIDTH) / 2)
    local BOX_W = INNER + 2
    local TOTAL_W = BOX_W + 1
    local rows = {
        { sp = 4, bk = 14 },
        { sp = 4, bk = 14 },
        { sp = 4, bk = 14 },
        { sp = 4, bk = 14 },
        { sp = 0, bk = 8 },
        { sp = 0, bk = 8 },
        { sp = 0, bk = 18 },
        { sp = 0, bk = 18 },
        { sp = 0, bk = 8 },
        { sp = 0, bk = 8 },
    }
    local segs = {}
    local v = vim.version()
    local title = " neovim "
    local meta_label = " v" .. v.major .. "." .. v.minor .. "." .. v.patch .. " · " .. os.date("%Y-%m-%d") .. " "
    local title_w = vim.fn.strdisplaywidth(title)
    local meta_w = vim.fn.strdisplaywidth(meta_label)
    local top_dl = 1
    local top_dr = 1
    local top_mid = INNER - title_w - meta_w - top_dl - top_dr
    table.insert(segs, { "╔" .. string.rep("═", top_dl), hl = "Comment" })
    table.insert(segs, { title, hl = "PiBlue" })
    table.insert(segs, { string.rep("═", top_mid), hl = "Comment" })
    table.insert(segs, { meta_label, hl = "PiMeta" })
    table.insert(segs, { string.rep("═", top_dr) .. "╗ \n", hl = "Comment" })
    table.insert(segs, { "║" .. string.rep(" ", INNER) .. "║", hl = "Comment" })
    table.insert(segs, { "▒\n", hl = "PiShadow" })
    for _, r in ipairs(rows) do
        local trail = LOGO_WIDTH - r.sp - r.bk
        table.insert(segs, { "║" .. string.rep(" ", PAD + r.sp), hl = "Comment" })
        table.insert(segs, { string.rep("█", r.bk), hl = "PiBlue" })
        table.insert(segs, { string.rep(" ", trail + PAD) .. "║", hl = "Comment" })
        table.insert(segs, { "▒\n", hl = "PiShadow" })
    end
    table.insert(segs, { "║" .. string.rep(" ", INNER) .. "║", hl = "Comment" })
    table.insert(segs, { "▒\n", hl = "PiShadow" })
    table.insert(segs, { "╚" .. string.rep("═", INNER) .. "╝", hl = "Comment" })
    table.insert(segs, { "▒\n", hl = "PiShadow" })
    table.insert(segs, { " " })
    table.insert(segs, { string.rep("▒", BOX_W) .. "\n", hl = "PiShadow" })
    local emoji = "٩(◕‿◕｡)۶"
    local tagline = "\"I'm not much but I'm all I have.\""
    local emoji_w = vim.fn.strdisplaywidth(emoji)
    local tagline_w = vim.fn.strdisplaywidth(tagline)
    local quote_w = emoji_w + 1 + tagline_w
    local trail = TOTAL_W - quote_w
    table.insert(segs, { "\n" })
    table.insert(segs, { emoji, hl = "PiMeta" })
    table.insert(segs, { " " .. tagline, hl = "PiMeta" })
    if trail > 0 then
        table.insert(segs, { string.rep(" ", trail) })
    end
    return segs
end

return {
    "folke/snacks.nvim",
    priority = 1000,
    lazy = false,
    opts = {
        bigfile = { enabled = true },
        quickfile = { enabled = true },
        notifier = { enabled = true, timeout = 3000 },
        indent = { enabled = true },
        scroll = { enabled = true },
        statuscolumn = { enabled = true },
        words = { enabled = true },
        dashboard = {
            enabled = true,
            preset = {
                keys = {
                    { icon = " ", key = "f", desc = "Find File", action = ":lua Snacks.dashboard.pick('files')" },
                    { icon = " ", key = "n", desc = "New File", action = ":ene | startinsert" },
                    { icon = " ", key = "g", desc = "Find Text", action = ":lua Snacks.dashboard.pick('live_grep')" },
                    { icon = " ", key = "r", desc = "Recent Files", action = ":lua Snacks.dashboard.pick('oldfiles')" },
                    { icon = " ", key = "c", desc = "Config", action = ":lua Snacks.dashboard.pick('files', {cwd = vim.fn.stdpath('config')})" },
                    { icon = " ", key = "s", desc = "Restore Session", action = ':lua require("persistence").load()' },
                    { icon = " ", key = "q", desc = "Quit", action = ":qa" },
                },
            },
            sections = {
                { text = pi_header(), align = "center", padding = 1 },
                { text = pi_divider(), align = "center", padding = 1 },
                { section = "keys", gap = 1, padding = 1 },
            },
        },
        explorer = { enabled = true, replace_netrw = true },
        picker = {
            enabled = true,
            win = {
                input = {
                    keys = {
                        ["-"] = { "edit_split", mode = { "n" } },
                        ["\\"] = { "edit_vsplit", mode = { "n" } },
                    },
                },
            },
            sources = {
                explorer = {
                    layout = { preset = "sidebar", layout = { position = "right" } },
                },
                lines = {
                    layout = { preset = "default" },
                },
            },
        },
        lazygit = { enabled = true },
        terminal = { enabled = true },
        bufdelete = { enabled = true },
        gitbrowse = { enabled = true },
        input = { enabled = true },
    },
    keys = {
        { "<leader>ff", function() Snacks.picker.files() end,         desc = "Find files" },
        { "<leader>fg", function() Snacks.picker.grep() end,          desc = "Live grep" },
        { "<leader>fl", function() Snacks.picker.lines() end,         desc = "Lines (current buffer)" },
        { "<leader>fw", function() Snacks.picker.grep_word() end,     desc = "Grep word / selection", mode = { "n", "x" } },
        { "<leader>fb", function() Snacks.picker.buffers() end,       desc = "Buffers" },
        { "<leader>fr", function() Snacks.picker.recent() end,        desc = "Recent files" },
        { "<leader>fc", function() Snacks.picker.command_history() end, desc = "Command history" },
        { "<leader>fk", function() Snacks.picker.keymaps() end,       desc = "Keymaps" },
        { "<leader>uC", function() Snacks.picker.colorschemes() end,  desc = "Colorschemes (live preview)" },
        { "<leader>fh", function() Snacks.picker.help() end,          desc = "Help" },
        { "<leader>fs", function() Snacks.picker.lsp_symbols() end,   desc = "Document symbols" },
        { "<leader>fS", function() Snacks.picker.lsp_workspace_symbols() end, desc = "Workspace symbols" },
        { "<leader>ft", function() Snacks.picker.todo_comments() end, desc = "Todos" },
        { "<leader>fd", function() Snacks.picker.diagnostics_buffer() end, desc = "Diagnostics (buffer)" },
        { "<leader>fD", function() Snacks.picker.diagnostics() end,        desc = "Diagnostics (workspace)" },

        { "<leader>gg", function() Snacks.lazygit() end,                desc = "Lazygit" },
        { "<leader>gB", function() Snacks.gitbrowse() end,              desc = "Git browse (open in browser)" },
        { "<leader>gb", function() Snacks.git.blame_line() end,         desc = "Git blame line" },
        { "<leader>gl", function() Snacks.picker.git_log() end,         desc = "Git log" },
        { "<leader>gs", function() Snacks.picker.git_status() end,      desc = "Git status" },

        { "<leader>nh", function() Snacks.notifier.show_history() end,  desc = "Notification history" },
        { "<leader>e",  function() Snacks.explorer() end,               desc = "Explorer" },
        { "<leader>`",  function() Snacks.terminal() end,               desc = "Toggle terminal" },
        { "<leader>bd", function()
            local bufnr = vim.api.nvim_get_current_buf()
            if #vim.api.nvim_tabpage_list_wins(0) > 1 then
                vim.cmd("close")
            end
            Snacks.bufdelete(bufnr)
        end, desc = "Delete buffer + close split" },
    },
}
