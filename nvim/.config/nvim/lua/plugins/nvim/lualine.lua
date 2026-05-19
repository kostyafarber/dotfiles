local latte = {
    base     = "#eff1f5",
    mantle   = "#e6e9ef",
    surface0 = "#ccd0da",
    overlay1 = "#8c8fa1",
    text     = "#4c4f69",
    mauve    = "#8839ef",
    blue     = "#1e66f5",
    green    = "#40a02b",
    sapphire = "#209fb5",
    red      = "#d20f39",
    peach    = "#fe640b",
    yellow   = "#df8e1d",
    lavender = "#7287fd",
}

local bubbles_theme = {
    normal   = { a = { fg = latte.base, bg = latte.mauve,    gui = "bold" }, b = { fg = latte.text, bg = latte.surface0 }, c = { fg = latte.text, bg = latte.base } },
    insert   = { a = { fg = latte.base, bg = latte.green,    gui = "bold" } },
    visual   = { a = { fg = latte.base, bg = latte.sapphire, gui = "bold" } },
    replace  = { a = { fg = latte.base, bg = latte.red,      gui = "bold" } },
    command  = { a = { fg = latte.base, bg = latte.peach,    gui = "bold" } },
    inactive = { a = { fg = latte.overlay1, bg = latte.mantle }, b = { fg = latte.overlay1, bg = latte.mantle }, c = { fg = latte.overlay1, bg = latte.base } },
}

local function lsp_name()
    local clients = vim.lsp.get_clients({ bufnr = 0 })
    if #clients == 0 then return "" end
    local names = {}
    for _, c in ipairs(clients) do
        if c.name ~= "copilot" then
            table.insert(names, c.name)
        end
    end
    if #names == 0 then return "" end
    return " " .. table.concat(names, ", ")
end

return {
    "nvim-lualine/lualine.nvim",
    dependencies = { "nvim-tree/nvim-web-devicons" },
    event = "VeryLazy",
    opts = {
        options = {
            theme = bubbles_theme,
            globalstatus = true,
            component_separators = "",
            section_separators = { left = "", right = "" },
        },
        sections = {
            lualine_a = { { "mode", separator = { left = "" }, right_padding = 2 } },
            lualine_b = { { "filename", path = 1 }, "branch" },
            lualine_c = { "%=" },
            lualine_x = { lsp_name, "diff", "diagnostics" },
            lualine_y = { "filetype", "progress" },
            lualine_z = { { "location", separator = { right = "" }, left_padding = 2 } },
        },
        inactive_sections = {
            lualine_a = { { "filename", separator = { left = "" }, right_padding = 2 } },
            lualine_b = {},
            lualine_c = {},
            lualine_x = {},
            lualine_y = {},
            lualine_z = { { "location", separator = { right = "" }, left_padding = 2 } },
        },
    },
}
