-- Built from the active catppuccin palette (flavour + Rex color_overrides, see
-- colourscheme.lua). lualine calls a function theme again on every ColorScheme,
-- so dark/light and Rex theme switches carry through to the statusline.
local function bubbles_theme()
    local c = require("catppuccin.palettes").get_palette()
    return {
        normal   = { a = { fg = c.base, bg = c.mauve,    gui = "bold" }, b = { fg = c.text, bg = c.surface0 }, c = { fg = c.text, bg = c.base } },
        insert   = { a = { fg = c.base, bg = c.green,    gui = "bold" } },
        visual   = { a = { fg = c.base, bg = c.sapphire, gui = "bold" } },
        replace  = { a = { fg = c.base, bg = c.red,      gui = "bold" } },
        command  = { a = { fg = c.base, bg = c.peach,    gui = "bold" } },
        inactive = { a = { fg = c.overlay1, bg = c.mantle }, b = { fg = c.overlay1, bg = c.mantle }, c = { fg = c.overlay1, bg = c.base } },
    }
end

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
