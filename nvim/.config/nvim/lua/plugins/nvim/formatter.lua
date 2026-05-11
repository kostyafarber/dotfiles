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

		conform.formatters.templ = {
			inherit = false,
			command = "templ",
			args = { "fmt", "-stdout", "-stdin-filepath", "$FILENAME" },
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
				html = { "prettierd" },
				css = { "prettierd" },
				go = { "gofumpt", "goimports" },
				json = { "jq" },
			},
			default_format_opts = {
				lsp_format = "never",
			},
			format_on_save = function(bufnr)
				if vim.g.disable_autoformat or vim.b[bufnr].disable_autoformat then
					return
				end
				return { timeout_ms = 3000 }
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
