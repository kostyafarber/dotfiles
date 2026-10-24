-- Breakpoints for JS/TS through vscode-js-debug (Mason: js-debug-adapter).
-- Electron: <leader>jl starts the app's dev command with the inspectors on in a Rex tab,
-- then <leader>ja attaches to the main and renderer processes (or <F5> to pick one).
--
-- Per-project values come from vim.g.electron_debug (set it in a project or work config):
--   renderer_root = "src/renderer"           -- Vite root, relative to the git root
--   launch = { cmd = { "pnpm", "dev", ... } } -- run from the git root

local js_filetypes = { "typescript", "typescriptreact", "javascript", "javascriptreact" }

local function settings()
    return vim.g.electron_debug or {}
end

local function git_root()
    local root = vim.trim(vim.fn.system({ "git", "rev-parse", "--show-toplevel" }))
    return vim.v.shell_error == 0 and root or vim.fn.getcwd()
end

-- The renderer's Vite root: dev-server URLs map onto it, so renderer breakpoints only bind
-- with webRoot set to it. Falls back to the workspace.
local function renderer_root()
    local rel = settings().renderer_root
    local root = rel and (git_root() .. "/" .. rel)
    return root and vim.fn.isdirectory(root) == 1 and root or vim.fn.getcwd()
end

-- Main runs under `--inspect 9229`, the renderer under `--remoteDebuggingPort 9222`.
local function electron_configs()
    local sources = { "${workspaceFolder}/**", "!**/node_modules/**" }
    return {
        {
            name = "Electron: main",
            type = "pwa-node",
            request = "attach",
            port = 9229,
            cwd = "${workspaceFolder}",
            sourceMaps = true,
            resolveSourceMapLocations = sources,
        },
        {
            name = "Electron: renderer",
            type = "pwa-chrome",
            request = "attach",
            port = 9222,
            webRoot = renderer_root,
            -- Vite serves files outside its root (e.g. workspace packages) at /@fs/<absolute path>.
            pathMapping = { ["/@fs/"] = "/" },
            sourceMaps = true,
            resolveSourceMapLocations = sources,
        },
        {
            name = "Node: attach to process",
            type = "pwa-node",
            request = "attach",
            processId = function() return require("dap.utils").pick_process() end,
            cwd = "${workspaceFolder}",
            sourceMaps = true,
            resolveSourceMapLocations = sources,
        },
    }
end

-- Runs the project's dev command with both inspectors on in a new Rex tab, from the git root.
local function start_electron_debug()
    local launch = settings().launch
    if not launch then
        return vim.notify("set vim.g.electron_debug.launch = { cmd = {...} } for this project", vim.log.levels.WARN)
    end
    local root = git_root()
    local cmd = launch.cmd
    if not vim.env.REX_SESSION then
        return vim.notify("not in Rex: run " .. table.concat(cmd, " "), vim.log.levels.WARN)
    end
    local args = { "rex", "window", "new", "-s", vim.env.REX_SESSION, "electron-debug", "-c", root,
        "--focus=false", "--" }
    vim.system(vim.list_extend(args, cmd))
    vim.notify("dev starting in the electron-debug tab; <leader>ja to attach once the window is up")
end

return {
    {
        "mfussenegger/nvim-dap",
        dependencies = { "igorlfs/nvim-dap-view" },
        keys = {
            { "<F5>", function() require("dap").continue() end, desc = "Debug: start / continue" },
            { "<F10>", function() require("dap").step_over() end, desc = "Debug: step over" },
            { "<F11>", function() require("dap").step_into() end, desc = "Debug: step into" },
            { "<F12>", function() require("dap").step_out() end, desc = "Debug: step out" },
            { "<leader>jb", function() require("dap").toggle_breakpoint() end, desc = "Debug: toggle breakpoint" },
            {
                "<leader>jB",
                function() require("dap").set_breakpoint(vim.fn.input("Condition: ")) end,
                desc = "Debug: conditional breakpoint",
            },
            { "<leader>jc", function() require("dap").run_to_cursor() end, desc = "Debug: run to cursor" },
            { "<leader>jv", "<cmd>DapViewToggle<cr>", desc = "Debug: toggle panel" },
            { "<leader>jw", "<cmd>DapViewWatch<cr>", mode = { "n", "v" }, desc = "Debug: watch expression" },
            { "<leader>jq", function() require("dap").terminate() end, desc = "Debug: stop" },
            { "<leader>jl", start_electron_debug, desc = "Debug: launch Electron dev with inspectors" },
            {
                "<leader>ja",
                function()
                    local dap = require("dap")
                    -- nvim-dap has no compound configs: one session per process.
                    dap.run(electron_configs()[1])
                    dap.run(electron_configs()[2])
                end,
                desc = "Debug: attach to Electron main + renderer",
            },
        },
        config = function()
            local dap = require("dap")
            local adapter = {
                type = "server",
                host = "localhost",
                port = "${port}",
                executable = {
                    command = vim.fn.stdpath("data") .. "/mason/bin/js-debug-adapter",
                    args = { "${port}" },
                },
            }
            dap.adapters["pwa-node"] = adapter
            dap.adapters["pwa-chrome"] = adapter
            for _, ft in ipairs(js_filetypes) do
                dap.configurations[ft] = electron_configs()
            end

            vim.fn.sign_define("DapBreakpoint", { text = "●", texthl = "DiagnosticError" })
            vim.fn.sign_define("DapBreakpointCondition", { text = "◆", texthl = "DiagnosticWarn" })
            vim.fn.sign_define("DapStopped", { text = "▶", texthl = "DiagnosticOk", linehl = "Visual" })
        end,
    },
    {
        "igorlfs/nvim-dap-view",
        lazy = true,
        opts = { auto_toggle = true },
    },
}
