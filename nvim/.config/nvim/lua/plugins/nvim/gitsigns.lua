-- ]c / [c: in a codediff (review) tab the diff's new side is the real file, so gitsigns attaches
-- there too and its map would shadow codediff's. Hand off to codediff when the tab has a session.
local function nav(direction)
    local ok, lifecycle = pcall(require, "codediff.ui.lifecycle")
    if ok and lifecycle.get_session(vim.api.nvim_get_current_tabpage()) then
        local navigation = require("codediff.ui.view.navigation")
        return direction == "next" and navigation.next_hunk() or navigation.prev_hunk()
    end
    require("gitsigns").nav_hunk(direction)
end

return {
    "lewis6991/gitsigns.nvim",
    event = { "BufReadPre", "BufNewFile" },
    opts = {
        on_attach = function(bufnr)
            local gs = require("gitsigns")
            local function map(mode, lhs, rhs, desc)
                vim.keymap.set(mode, lhs, rhs, { buffer = bufnr, desc = desc })
            end
            map("n", "]c", function() nav("next") end, "Next hunk")
            map("n", "[c", function() nav("prev") end, "Prev hunk")
            map("n", "<leader>gs", gs.stage_hunk, "Stage hunk")
            map("n", "<leader>gr", gs.reset_hunk, "Reset hunk")
            map("n", "<leader>gp", gs.preview_hunk, "Preview hunk (popup)")
            map("n", "<leader>gi", gs.preview_hunk_inline, "Preview hunk inline")
            map("n", "<leader>gx", gs.toggle_deleted, "Toggle deleted (inline)")
            map("n", "<leader>gw", gs.toggle_word_diff, "Toggle word diff")
            map("n", "<leader>gb", function() gs.blame_line({ full = true }) end, "Blame line")
            map("n", "<leader>gU", gs.undo_stage_hunk, "Undo stage hunk")
        end,
    },
}
