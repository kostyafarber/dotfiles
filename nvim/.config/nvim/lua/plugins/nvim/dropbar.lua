return {
    "Bekaboo/dropbar.nvim",
    event = { "BufReadPre", "BufNewFile" },
    keys = {
        { "<leader>;", function() require("dropbar.api").pick() end, desc = "Pick breadcrumb" },
    },
    config = function()
        -- dropbar's own rule for which windows get a bar, minus the journal (core/journal.lua).
        local default = require("dropbar.configs").opts.bar.enable
        require("dropbar").setup({
            bar = {
                enable = function(buf, win, info)
                    if require("core/journal").is_journal(buf) then return false end
                    return default(buf, win, info)
                end,
            },
        })
    end,
}
