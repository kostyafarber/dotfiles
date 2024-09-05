local v = require('vscode')

-- general
vim.keymap.set("n", "<leader>ca", function() v.action("editor.action.quickFix") end)
vim.keymap.set("n", "<leader>i", function() v.action("extension.toggleBool") end)
vim.keymap.set('n', '<leader>n', 'mciw*<Cmd>nohl<CR>', { remap = true })
 
vim.keymap.set("n", "<C-d>", "<C-d>zz")
vim.keymap.set("n", "<C-u>", "<C-u>zz")

vim.keymap.set("n", "<leader>b", function() v.action("workbench.action.toggleSidebarVisibility") end)

-- github
vim.keymap.set("n", "<leader>gr", function() v.action("openInGitHub.openProject") end)
vim.keymap.set("n", "<leader>gf", function() v.action("openInGitHub.openFile") end)
vim.keymap.set("n", "<leader>gl", function() v.action("issue.copyGithubPermalink") end)
vim.keymap.set("n", "<leader>gp", function() v.action("pr.openPullRequestOnGitHub") end)


-- copilot
vim.keymap.set("n", "<leader>cc", function() v.action("workbench.panel.chat.view.copilot.focus") end)

-- lsp
vim.keymap.set("n", "]d", function() v.action("editor.action.marker.next") end)

-- editor
vim.keymap.set("n", "gr", function() v.action("editor.action.rename") end)
vim.keymap.set("n", "<leader>l", function() v.action("workbench.action.nextEditor") end)
vim.keymap.set("n", "<leader>h", function() v.action("workbench.action.previousEditor") end)
vim.keymap.set("n", "<leader>c", function() v.action("workbench.action.closeAllEditors") end)

vim.keymap.set("n", "<leader>\\", function() v.action("workbench.action.splitEditorRight") end)

-- terminal
vim.keymap.set("n", "<leader>tk", function() v.action("workbench.action.terminal.killAll") end)

-- debugger
vim.keymap.set("n", "<leader>dr", function() v.action("workbench.action.debug.start") end)
vim.keymap.set("n", "<leader>ds", function() v.action("workbench.action.debug.stop") end)
vim.keymap.set("n", "<leader>dc", function() v.action("workbench.action.debug.continue") end)
vim.keymap.set("n", "<leader>di", function() v.action("workbench.action.debug.stepInto") end)
vim.keymap.set("n", "<leader>do", function() v.action("workbench.action.debug.stepOver") end)

vim.keymap.set("n", "<leader>db", function() v.action("editor.debug.action.toggleBreakpoint") end)
vim.keymap.set("n", "<leader>dw", function() v.action("editor.debug.action.selectionToWatch") end)
vim.keymap.set("n", "<leader>dcw", function() v.action("workbench.debug.viewlet.action.removeAllWatchExpressions") end)
vim.keymap.set("n", "<leader>dcb", function() v.action("workbench.debug.viewlet.action.removeAllBreakpoints") end)


vim.keymap.set("n", "<leader>z", function() v.action("workbench.action.toggleZenMode") end)

-- extensions
vim.keymap.set("n", "<leader>px", function() v.action("extension.pxToremAndRemToPx") end)

-- -- random
function cd_current_file()
    v.action("workbench.action.terminal.sendSequence", { args = { text = "cd ${fileDirname}\n" }})
    v.action("workbench.action.terminal.focus")
    return
end

function cd_root()
    v.action("workbench.action.terminal.sendSequence", { args = { text = "cd ${workspaceFolder}\n" }})
    v.action("workbench.action.terminal.focus")
    return
end

function run_jest_test() 
    v.action("workbench.action.terminal.sendSequence", { args = { text = "npx jest ${file} -u\n" }})
    return
end

function open_telescope()
    v.action("workbench.action.terminal.sendSequence", { args = { text = 'nvim . +"Telescope live_grep"\n' }})
    v.action("workbench.action.terminal.focus")
    return
end

vim.keymap.set("n", "<leader>ff", open_telescope) 

vim.keymap.set("n", "<leader>cd", cd_current_file) 
vim.keymap.set("n", "<leader>cr", cd_root) 

vim.keymap.set("n", "<leader>jr", run_jest_test) 

