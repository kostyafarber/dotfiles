return {
    "Bekaboo/dropbar.nvim",
    event = { "BufReadPre", "BufNewFile" },
    keys = {
        { "<leader>;", function() require("dropbar.api").pick() end, desc = "Pick breadcrumb" },
    },
}
