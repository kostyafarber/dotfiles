local vscode = require('vscode-neovim')

vim.opt.clipboard:append("unnamedplus")

vim.keymap.set("n", "<leader>ca", function() vscode.action("editor.action.quickFix") end)
vim.keymap.set("n", "<leader>i", function() vscode.action("extension.toggleBool") end)

vim.keymap.set("n", "<leader>z", function() vscode.action("workbench.action.toggleZenMode") end)

-- copilot
vim.keymap.set("n", "<leader>cc", function() vscode.action("workbench.panel.chat.view.copilot.focus") end)

-- editor 
vim.keymap.set("n", "<leader>l", function() vscode.action("workbench.action.nextEditor") end)
vim.keymap.set("n", "<leader>h", function() vscode.action("workbench.action.previousEditor") end)
vim.keymap.set("n", "<leader>c", function() vscode.action("workbench.action.closeAllGroups") end)

-- lsp
vim.keymap.set("n", "gr", function() vscode.action("editor.action.rename") end)
vim.keymap.set("n", "]d", function() vscode.action("editor.action.marker.next") end)

-- debugger
vim.keymap.set("n", "dc", function() vscode.action("workbench.action.debug.continue") end)
vim.keymap.set("n", "di", function() vscode.action("workbench.action.debug.stepInto") end)
vim.keymap.set("n", "do", function() vscode.action("workbench.action.debug.stepOver") end)

vim.keymap.set('n', '<leader>n', 'mciw*<Cmd>nohl<CR>', { remap = true })
