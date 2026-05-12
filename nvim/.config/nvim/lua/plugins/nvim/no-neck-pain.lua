return {
    "shortcuts/no-neck-pain.nvim",
    cmd = { "NoNeckPain", "NoNeckPainResize", "NoNeckPainWidthUp", "NoNeckPainWidthDown" },
    keys = {
        { "<leader>z", "<cmd>NoNeckPain<cr>", desc = "Toggle No Neck Pain" },
    },
    opts = {
        width = 140,
        autocmds = {
            enableOnVimEnter = false,
            reloadOnColorSchemeChange = true,
        },
        buffers = {
            scratchPad = { enabled = false },
            bo = { filetype = "no-neck-pain" },
        },
    },
}
