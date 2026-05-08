return {
	"stevearc/conform.nvim",
	event = "VeryLazy",
	config = function()
		local conform = require("conform")
		local function js(bufnr)
			if conform.get_formatter_info("oxfmt", bufnr).available then
				return { "oxfmt", "eslint_d" }
			end
			return { "prettierd", "eslint_d" }
		end

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
				javascript = js,
				javascriptreact = js,
				typescript = js,
				typescriptreact = js,
				html = { "prettierd" },
				css = { "prettierd" },
				go = { "gofumpt", "goimports" },
				json = { "jq" },
			},
			format_on_save = function(bufnr)
				-- Disable with a global or buffer-local variable
				if vim.g.disable_autoformat or vim.b[bufnr].disable_autoformat then
					return
				end
				return { timeout_ms = 3000, lsp_fallback = false }
			end,
		})
		vim.api.nvim_create_user_command("FormatDisable", function(args)
			if args.bang then
				-- FormatDisable! will disable formatting just for this buffer
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
		vim.keymap.set("n", "<leader>cf", conform.format, { desc = "Format buffer" })
	end,
}
