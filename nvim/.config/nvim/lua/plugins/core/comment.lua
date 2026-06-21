return {
    'numToStr/Comment.nvim',
    opts = {},
    init = function()
        require("Comment.ft").set("typescriptreact", "//%s")
        require("Comment.ft").set("javascriptreact", "//%s")
    end,
}

