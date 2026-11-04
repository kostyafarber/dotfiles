return {
    "zbirenbaum/copilot.lua",
    cmd = "Copilot",
    event = "InsertEnter",
    opts = {
        suggestion = { enabled = false },
        panel = { enabled = false },
        filetypes = { ["*"] = true },
        -- Never in the journal (core/journal.lua); otherwise copilot.lua's default.
        should_attach = function(bufnr, bufname)
            if require("core/journal").is_journal(bufnr) then return false end
            return require("copilot.config.should_attach").default(bufnr, bufname)
        end,
    },
}
