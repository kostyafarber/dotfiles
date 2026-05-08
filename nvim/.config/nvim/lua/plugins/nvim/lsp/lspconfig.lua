return {
    "neovim/nvim-lspconfig",
    event = { "BufReadPre", "BufNewFile" },
    dependencies = {
        "saghen/blink.cmp",
        { "antosha417/nvim-lsp-file-operations", config = true },
        { "folke/lazydev.nvim", ft = "lua", opts = {} },
    },
    config = function()
        local capabilities = require("blink.cmp").get_lsp_capabilities()
        vim.lsp.config("*", { capabilities = capabilities })

        vim.lsp.config("lua_ls", {
            settings = {
                Lua = {
                    diagnostics = { globals = { "vim" } },
                    completion = { callSnippet = "Replace" },
                },
            },
        })

        vim.lsp.config("graphql", {
            filetypes = { "graphql", "gql", "svelte", "typescriptreact", "javascriptreact" },
        })

        vim.lsp.config("emmet_ls", {
            filetypes = { "html", "typescriptreact", "javascriptreact", "css", "sass", "scss", "less", "svelte" },
        })

        vim.lsp.enable({
            "ts_ls", "lua_ls", "html", "cssls", "tailwindcss",
            "svelte", "graphql", "emmet_ls", "prismals", "pyright", "ruff",
        })

        vim.lsp.config("pyright", {
            settings = {
                pyright = { disableOrganizeImports = true },
                python = { analysis = { ignore = { "*" } } },
            },
        })

        vim.lsp.config("ruff", {
            on_attach = function(client)
                client.server_capabilities.hoverProvider = false
            end,
        })

        vim.diagnostic.config({
            virtual_text = true,
            signs = {
                text = {
                    [vim.diagnostic.severity.ERROR] = " ",
                    [vim.diagnostic.severity.WARN]  = " ",
                    [vim.diagnostic.severity.HINT]  = "󰠠 ",
                    [vim.diagnostic.severity.INFO]  = " ",
                },
            },
        })

        vim.api.nvim_create_autocmd("LspAttach", {
            group = vim.api.nvim_create_augroup("UserLspConfig", {}),
            callback = function(ev)
                local function map(mode, lhs, rhs, desc)
                    vim.keymap.set(mode, lhs, rhs, { buffer = ev.buf, silent = true, desc = desc })
                end
                map("n", "gR",         function() Snacks.picker.lsp_references() end,        "LSP references")
                map("n", "gD",         vim.lsp.buf.declaration,                              "Go to declaration")
                map("n", "gd",         function() Snacks.picker.lsp_definitions() end,       "Definitions")
                map("n", "gi",         function() Snacks.picker.lsp_implementations() end,   "Implementations")
                map("n", "gt",         function() Snacks.picker.lsp_type_definitions() end,  "Type definitions")
                map({ "n", "v" }, "<leader>ca", vim.lsp.buf.code_action,                     "Code action")
                map("n", "<leader>rn", vim.lsp.buf.rename,                                   "Rename")
                map("n", "<leader>D",  function() Snacks.picker.diagnostics_buffer() end,    "Buffer diagnostics")
                map("n", "<leader>d",  vim.diagnostic.open_float,                            "Line diagnostics")
                map("n", "[d",         function() vim.diagnostic.jump({ count = -1, float = true }) end, "Prev diagnostic")
                map("n", "]d",         function() vim.diagnostic.jump({ count = 1,  float = true }) end, "Next diagnostic")
                map("n", "K",          vim.lsp.buf.hover,                                    "Hover")
                map("n", "<leader>rs", "<cmd>LspRestart<CR>",                                "Restart LSP")
                map("n", "<C-LeftMouse>", "<LeftMouse><cmd>lua vim.lsp.buf.definition()<CR>", "Go to definition (ctrl-click)")

                local client = vim.lsp.get_client_by_id(ev.data.client_id)
                if client and client:supports_method("textDocument/inlayHint") then
                    vim.lsp.inlay_hint.enable(true, { bufnr = ev.buf })
                    map("n", "<leader>ih", function()
                        vim.lsp.inlay_hint.enable(not vim.lsp.inlay_hint.is_enabled({ bufnr = ev.buf }), { bufnr = ev.buf })
                    end, "Toggle inlay hints")
                end
            end,
        })
    end,
}
