return {
	"nvim-telescope/telescope.nvim",
	tag = "0.1.4",
	dependencies = {
		"nvim-lua/plenary.nvim",
		{
			"nvim-telescope/telescope-live-grep-args.nvim",
			-- This will not install any breaking changes.
			-- For major updates, this must be adjusted manually.
			version = "^1.0.0",
		},
	},
	config = function()
		local telescope = require("telescope")
		local builtin = require("telescope.builtin")
		local actions = require("telescope.actions")
		local action_state = require("telescope.actions.state")

		local function find_files()
			builtin.find_files({
				find_command = { "rg", "--files", "--hidden", "-g", "!.git" },
			})
		end

		vim.keymap.set("n", "<leader>ff", find_files, {})
		vim.keymap.set("n", "<leader>fb", builtin.buffers, {})

		telescope.load_extension("live_grep_args")
		vim.keymap.set("n", "<leader>fg", ":lua require('telescope').extensions.live_grep_args.live_grep_args()<CR>")
	end,
}
