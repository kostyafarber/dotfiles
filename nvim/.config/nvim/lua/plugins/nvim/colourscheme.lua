return {
    "catppuccin/nvim",
    name = "catppuccin",
    lazy = false,
    priority = 1000,
    opts = {
        flavour = "latte",
        integrations = {
            blink_cmp = true,
            diffview = true,
            gitsigns = true,
            mason = true,
            snacks = { enabled = true, indent_scope_color = "lavender" },
            treesitter = true,
            which_key = true,
            lsp_trouble = true,
            telescope = { enabled = false },
            native_lsp = { enabled = true, inlay_hints = { background = true } },
        },
        custom_highlights = function(C)
            -- latte base is light (#eff1f5), mocha base is dark (#1e1e2e). Only
            -- override diffs on the light flavour — these are GitHub-light colours
            -- and would look wrong on mocha, where catppuccin's own diff/git
            -- palette is already tuned for dark.
            if tonumber(C.base:sub(2, 3), 16) < 128 then
                return {
                    Cursor = { fg = "#FF00FF" },
                    lCursor = { fg = "#FF00FF" },
                }
            end
            return {
                Cursor = { fg = "#00FF00" },
                lCursor = { fg = "#00FF00" },

                DiffAdd     = { bg = "#dafbe1" },
                DiffChange  = { bg = "#dafbe1" },
                DiffDelete  = { bg = "#ffebe9", fg = "#82071e" },
                DiffText    = { bg = "#aceebb", bold = true },

                GitSignsAdd        = { fg = "#1a7f37" },
                GitSignsChange     = { fg = "#9a6700" },
                GitSignsDelete     = { fg = "#cf222e" },

                DiffviewDiffAdd         = { bg = "#dafbe1" },
                DiffviewDiffChange      = { bg = "#dafbe1" },
                DiffviewDiffDelete      = { bg = "#ffebe9", fg = "#82071e" },
                DiffviewDiffText        = { bg = "#aceebb", bold = true },
                DiffviewDiffAddAsDelete = { bg = "#ffebe9" },
                DiffviewDiffDeleteText  = { bg = "#ffaba8", bold = true },
            }
        end,
    },
    config = function(_, opts)
        require("catppuccin").setup(opts)

        -- Dark/light is driven by the `theme` CLI (and ghostty) via a shared state
        -- file. We read it on startup and watch it live, so `theme dark` in any
        -- terminal restyles every running nvim too — no restart, no remote plumbing.
        local uv = vim.uv or vim.loop
        local script = vim.fn.expand("~/.dotfiles/zshrc/bin/theme")
        local state_dir = vim.fn.expand("~/.local/state/theme")
        local state_file = state_dir .. "/mode"
        vim.fn.mkdir(state_dir, "p")

        local function read_mode()
            local f = io.open(state_file, "r")
            if not f then return "light" end
            local m = (f:read("l") or ""):gsub("%s+", "")
            f:close()
            return m == "dark" and "dark" or "light"
        end

        local function apply()
            local target = read_mode() == "dark" and "catppuccin-mocha" or "catppuccin-latte"
            if vim.g.colors_name ~= target then
                pcall(vim.cmd.colorscheme, target)
            end
        end

        local function apply_cursor()
            vim.api.nvim_set_hl(0, "Cursor",       { bg = "#C0392B", fg = "#ffffff" })
            vim.api.nvim_set_hl(0, "CursorInsert", { bg = "#E07B00", fg = "#ffffff" })
        end

        apply()
        apply_cursor()
        vim.api.nvim_create_autocmd("VimEnter", { callback = function() apply(); apply_cursor() end })
        vim.api.nvim_create_autocmd("ColorScheme", { callback = apply_cursor })

        -- Live-follow the state file in every running instance.
        local watcher = uv.new_fs_event()
        if watcher then
            watcher:start(state_dir, {}, vim.schedule_wrap(function(err)
                if not err then apply() end
            end))
        end

        -- Drive the full switch (nvim + ghostty) from inside nvim as well.
        for _, m in ipairs({ "Dark", "Light", "Toggle" }) do
            vim.api.nvim_create_user_command("Theme" .. m, function()
                vim.system({ script, m:lower() })
            end, { desc = "Switch dark/light theme (nvim + ghostty)" })
        end
        vim.keymap.set("n", "<leader>ud", function() vim.system({ script, "toggle" }) end,
            { desc = "Toggle dark/light (nvim + ghostty)" })
    end,
}
