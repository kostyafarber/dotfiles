return {
    'nvim-telescope/telescope.nvim', tag = '0.1.4',
    dependencies = { 
          'nvim-lua/plenary.nvim',
          {
               "nvim-telescope/telescope-live-grep-args.nvim" ,
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

        -- Function to open file in VSCode using the 'code' command
        local function open_in_vscode(prompt_bufnr)
          local selection = action_state.get_selected_entry(prompt_bufnr)
          actions.close(prompt_bufnr)
          if selection then
            local filename = selection.filename
            local row = selection.lnum or 1
            local col = selection.col or 1

            -- Construct the command to open VSCode at the specific file and position
            local cmd = string.format('code --goto "%s:%d:%d"', filename, row, col)
            
            -- Execute the command
            vim.fn.system(cmd)
          end
        end

        -- Custom live_grep function
        local function live_grep()
          builtin.live_grep({
            attach_mappings = function(_, map)
              map('i', '<C-o>', open_in_vscode)
              map('n', '<C-o>', open_in_vscode)
              return true
            end
          })
        end

        vim.keymap.set('n', '<leader>ff', builtin.find_files, {})
        vim.keymap.set('n', '<leader>fb', builtin.buffers, {})
        vim.keymap.set('n', '<leader>fb', builtin.buffers, {})

        vim.api.nvim_create_user_command('Telescope code_live_grep', live_grep, {})
        vim.keymap.set('n', '<leader>fg', live_grep, { desc = "Live grep" })

        telescope.load_extension("live_grep_args")
    end
}

