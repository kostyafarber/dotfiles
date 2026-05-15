return {
	"stevearc/conform.nvim",
	event = { "BufWritePre" },
	cmd = { "ConformInfo" },
	keys = {
		{
			"<leader>cf",
			function()
				require("conform").format({ async = true })
			end,
			mode = "",
			desc = "Format buffer",
		},
	},
	config = function()
		local conform = require("conform")
		local util = require("conform.util")

		conform.formatters.templ = {
			inherit = false,
			command = "templ",
			args = { "fmt", "-stdout", "-stdin-filepath", "$FILENAME" },
		}

		conform.formatters.eslint_d = {
			cwd = util.root_file({
				".eslintrc",
				".eslintrc.js",
				".eslintrc.cjs",
				".eslintrc.json",
				".eslintrc.yaml",
				".eslintrc.yml",
				"eslint.config.js",
				"eslint.config.mjs",
				"eslint.config.cjs",
				"eslint.config.ts",
			}),
			require_cwd = true,
		}

		conform.setup({
			formatters_by_ft = {
				lua = { "stylua" },
				templ = { "templ" },
				python = { "ruff_organize_imports", "ruff_format" },
				javascript = { "oxfmt", "prettierd", stop_after_first = true },
				javascriptreact = { "oxfmt", "prettierd", stop_after_first = true },
				typescript = { "oxfmt", "prettierd", stop_after_first = true },
				typescriptreact = { "oxfmt", "prettierd", stop_after_first = true },
				html = { "oxfmt", "prettierd", stop_after_first = true },
				css = { "oxfmt", "prettierd", stop_after_first = true },
				go = { "gofumpt", "goimports" },
				json = { "jq" },
			},
			default_format_opts = {
				lsp_format = "never",
			},
			format_after_save = function(bufnr)
				if vim.g.disable_autoformat or vim.b[bufnr].disable_autoformat then
					return
				end
				return { lsp_format = "never" }
			end,
		})

		vim.api.nvim_create_user_command("FormatDisable", function(args)
			if args.bang then
				vim.b.disable_autoformat = true
			else
				vim.g.disable_autoformat = true
			end
		end, {
			desc = "Disable autoformat-on-save",
			bang = true,
		})
		vim.api.nvim_create_user_command("FormatEnable", function()
			vim.b.disable_autoformat = false
			vim.g.disable_autoformat = false
		end, {
			desc = "Re-enable autoformat-on-save",
		})
	end,
}
