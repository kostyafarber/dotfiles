return {
    "dmmulroy/tsc.nvim",
    cmd = "TSC",
    opts = {
        use_trouble_qflist = true,
        auto_open_qflist = true,
        run_as_monorepo = true,
    },
    keys = {
        { "<leader>xt", "<cmd>TSC<cr>", desc = "Typecheck project (tsc)" },
    },
}
