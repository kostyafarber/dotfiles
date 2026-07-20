vim.g.mapleader = " "

local k = vim.keymap.set

k("n", "<C-d>", "<C-d>zz")
k("n", "<C-u>", "<C-u>zz")

k("n", "<leader>w", "<cmd>update<cr>", { desc = "Save" })
k("n", "<leader>qq", "<cmd>xa<cr>", { desc = "Save all and quit" })

k("n", "<leader>-", "<cmd>split<cr>",  { desc = "Split horizontal" })
k("n", "<leader>|", "<cmd>vsplit<cr>", { desc = "Split vertical" })

k("n", "]q", "<cmd>cnext<CR>zz", { desc = "Next quickfix" })
k("n", "[q", "<cmd>cprev<CR>zz", { desc = "Prev quickfix" })
k("n", "]Q", "<cmd>clast<CR>zz", { desc = "Last quickfix" })
k("n", "[Q", "<cmd>cfirst<CR>zz", { desc = "First quickfix" })
k("n", "]l", "<cmd>lnext<CR>zz", { desc = "Next loclist" })
k("n", "[l", "<cmd>lprev<CR>zz", { desc = "Prev loclist" })

k("x", "*", [[y/\V<C-R>=escape(@",'/\')<CR><CR>]], { desc = "Search selection forward" })
k("x", "#", [[y?\V<C-R>=escape(@",'?\')<CR><CR>]], { desc = "Search selection backward" })

k("i", "<M-Right>", "<C-Right>", { desc = "Word forward" })
k("i", "<M-Left>",  "<C-Left>",  { desc = "Word back" })
k("i", "<M-BS>",    "<C-w>",     { desc = "Delete word back" })

k({ "i", "n", "v" }, "<S-Right>", "<S-Right>")
k({ "i", "n", "v" }, "<S-Left>",  "<S-Left>")

k("n", "<leader>of", function()
  vim.fn.jobstart({ "open", "-R", vim.fn.expand("%:p") })
end, { desc = "Reveal file in Finder" })

k("n", "<leader>ox", function()
  vim.fn.jobstart({ "open", vim.fn.expand("%:p") })
end, { desc = "Open file in default app" })

k("n", "<leader>cp", function()
  local path = vim.fn.expand("%:p")
  vim.fn.setreg("+", path)
  vim.notify("Copied: " .. path)
end, { desc = "Copy file path" })

k("n", "<leader>oo", function()
  local path = vim.fn.expand("%:p")
  local stripped = path:match("^%w+://(.*)$")
  if stripped then
    path = "/" .. stripped:gsub("^/+", "")
  end
  if path == "" or vim.fn.filereadable(path) == 0 and vim.fn.isdirectory(path) == 0 then
    path = vim.fn.getcwd()
  end
  local encoded = vim.uri_encode(path, "rfc2396")
  vim.fn.jobstart({ "open", "obsidian://open?path=" .. encoded })
end, { desc = "Open in Obsidian" })

