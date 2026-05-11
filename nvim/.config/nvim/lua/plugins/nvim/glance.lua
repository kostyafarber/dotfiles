return {
    "dnlhc/glance.nvim",
    cmd = "Glance",
    opts = {},
    keys = {
        { "<leader>pd", "<cmd>Glance definitions<cr>",      desc = "Peek definition" },
        { "<leader>pr", "<cmd>Glance references<cr>",       desc = "Peek references" },
        { "<leader>pi", "<cmd>Glance implementations<cr>",  desc = "Peek implementations" },
        { "<leader>pt", "<cmd>Glance type_definitions<cr>", desc = "Peek type definition" },
    },
}
