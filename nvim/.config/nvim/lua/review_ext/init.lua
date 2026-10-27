-- Hunk-style threads on top of review.nvim (georgeguimaraes/review.nvim).
--
-- 1. Cards: each comment renders as a full-width box titled "author type · file L1–L2", the
--    first line bold, the rest dimmed, wrapped to the window, with replies threaded under it.
--    review.nvim draws its own box first; we restyle that extmark in place (same id), so its
--    position tracking, which keeps notes on the same code as you edit, keeps working.
-- 2. Threads: comments carry an `author` ("you" when absent) and `replies`. <localleader>cR
--    replies to the comment under the cursor.
-- 3. An API for agents, called over this nvim's Rex socket by the look skill's `rv` script:
--    list / add / reply / goto / rm, so Claude can annotate the open review and walk you
--    through it, the way `hunk session comment …` does.

local M = {}

local ns = vim.api.nvim_create_namespace("review")
local ns_padding = vim.api.nvim_create_namespace("review_padding")

local function store()
    local s = require("review.store")
    s.load()
    return s
end

-- A colour `amount` of the way from bg to fg (both 0xRRGGBB).
local function blend(fg, bg, amount)
    local function ch(c, shift) return math.floor(c / 2 ^ shift) % 256 end
    local out = 0
    for _, shift in ipairs({ 16, 8, 0 }) do
        local v = ch(bg, shift) + (ch(fg, shift) - ch(bg, shift)) * amount
        out = out + math.floor(v + 0.5) * 2 ^ shift
    end
    return string.format("#%06x", out)
end

local function set_highlights()
    vim.api.nvim_set_hl(0, "ReviewCardTitle", { bold = true, default = true })
    -- Claude's orange for what Claude wrote; the user's name stays the plain bold text colour.
    vim.api.nvim_set_hl(0, "ReviewAuthorClaude", { fg = "#d97757", bold = true, default = true })
    vim.api.nvim_set_hl(0, "ReviewCardClaudeBorder", { fg = "#d97757", default = true })
    vim.api.nvim_set_hl(0, "ReviewAuthorYou", { link = "ReviewCardTitle", default = true })
    -- Gutter bars down the commented lines, coloured by who wrote the comment.
    vim.api.nvim_set_hl(0, "ReviewBarClaude", { fg = "#d97757", default = true })
    vim.api.nvim_set_hl(0, "ReviewBarYou", { link = "DiagnosticInfo", default = true })
    -- Resolved: the theme's pink (Catppuccin's when it's loaded) for the label and the bars.
    local ok, palettes = pcall(require, "catppuccin.palettes")
    local pink = ok and palettes.get_palette().pink or "#d16fae"
    vim.api.nvim_set_hl(0, "ReviewResolved", { fg = pink, bold = true, default = true })
    vim.api.nvim_set_hl(0, "ReviewBarResolved", { fg = pink, default = true })
    vim.api.nvim_set_hl(0, "ReviewCardResolved", { link = "Comment", default = true })
    vim.api.nvim_set_hl(0, "ReviewCardMeta", { link = "Comment", default = true })

    -- review.nvim hard-codes dark backgrounds for commented lines. Tint each type's colour into
    -- this theme's background instead, so light themes get a light band.
    local normal = vim.api.nvim_get_hl(0, { name = "Normal", link = false })
    local bg = normal.bg or (vim.o.background == "light" and 0xffffff or 0x000000)
    -- The body is read, not skimmed: nearly the full text colour, upright, a step under the title.
    local text = normal.fg or (vim.o.background == "light" and 0x000000 or 0xffffff)
    vim.api.nvim_set_hl(0, "ReviewCardBody", { fg = blend(text, bg, 0.85), default = true })
    for type, group in pairs({ Note = "ReviewNote", Suggestion = "ReviewSuggestion", Issue = "ReviewIssue",
        Praise = "ReviewPraise" }) do
        local fg = vim.api.nvim_get_hl(0, { name = group, link = false }).fg
        if fg then vim.api.nvim_set_hl(0, "Review" .. type .. "Line", { bg = blend(fg, bg, 0.12) }) end
    end
end

-- Cards ---------------------------------------------------------------------

local function wrap(text, width)
    local out = {}
    for _, para in ipairs(vim.split(text, "\n")) do
        if para == "" then
            out[#out + 1] = ""
        else
            local line = ""
            for word in para:gmatch("%S+") do
                if line == "" then
                    line = word
                elseif vim.fn.strdisplaywidth(line .. " " .. word) <= width then
                    line = line .. " " .. word
                else
                    out[#out + 1] = line
                    line = word
                end
                -- A word longer than the card: hard-break it.
                while vim.fn.strdisplaywidth(line) > width do
                    out[#out + 1] = vim.fn.strcharpart(line, 0, width)
                    line = vim.fn.strcharpart(line, width)
                end
            end
            out[#out + 1] = line
        end
    end
    return out
end

local function range_label(c)
    if c.line == 0 then return "file" end
    local prefix = (c.side or "new") == "old" and "L~" or "L"
    if c.line_end and c.line_end ~= c.line then
        return prefix .. c.line .. "–" .. c.line_end
    end
    return prefix .. c.line
end

-- Text width of the narrowest window showing bufnr, minus the sign and number columns, so the
-- card fits every window it's drawn in.
local function card_width(bufnr)
    local width
    for _, win in ipairs(vim.fn.win_findbuf(bufnr)) do
        local info = vim.fn.getwininfo(win)[1]
        width = math.min(width or math.huge, info.width - info.textoff)
    end
    return math.max(math.min((width or 80) - 1, 120), 30)
end

local authors = {
    claude = { icon = "✻", hl = "ReviewAuthorClaude" },
    you = { icon = "\u{f007}", hl = "ReviewAuthorYou" }, -- Nerd Font nf-fa-user
}

-- The author's icon and name, highlighted as theirs.
local function author_chunk(name)
    name = name or "you"
    local a = authors[name] or { icon = "●", hl = "ReviewCardTitle" }
    return { a.icon .. " " .. name, a.hl }
end

-- One row of the card: border, padded content, border.
local function row(border_hl, chunks, inner)
    local used = 0
    for _, ch in ipairs(chunks) do used = used + vim.fn.strdisplaywidth(ch[1]) end
    local line = { { "│ ", border_hl } }
    vim.list_extend(line, chunks)
    line[#line + 1] = { string.rep(" ", math.max(inner - used, 0)) .. " │", border_hl }
    return line
end

local function rule(left, right, border_hl, label_chunks, width)
    local line = { { left .. "─", border_hl } }
    local used = vim.fn.strdisplaywidth(left) + 1
    if label_chunks then
        line[#line + 1] = { " ", border_hl }
        used = used + 1
        for _, ch in ipairs(label_chunks) do
            line[#line + 1] = ch
            used = used + vim.fn.strdisplaywidth(ch[1])
        end
        line[#line + 1] = { " ", border_hl }
        used = used + 1
    end
    line[#line + 1] = { string.rep("─", math.max(width - used - 1, 1)) .. right, border_hl }
    return line
end

---@return table[] virt_lines
function M.card(c, width)
    local cfg = require("review.config").get()
    local info = cfg.comment_types[c.type] or {}
    local type_hl = info.hl or "ReviewSign"
    -- A card Claude opened gets Claude's border, so its notes stand out from the user's.
    local hl = c.author == "claude" and "ReviewCardClaudeBorder" or type_hl
    local inner = width - 4
    -- Resolved: one dim line, like a collapsed GitHub thread.
    if c.resolved then
        local who = author_chunk(c.author)
        local first = vim.split(c.text, "\n")[1] or ""
        local label = "  ✓ resolved"
        local rest = " · " .. who[1] .. " · " .. c.file .. " " .. range_label(c) .. " · "
        local room = math.max(width - vim.fn.strdisplaywidth(label .. rest) - 2, 8)
        if vim.fn.strdisplaywidth(first) > room then first = vim.fn.strcharpart(first, 0, room - 1) .. "…" end
        return { { { label, "ReviewResolved" }, { rest .. first, "ReviewCardResolved" } } }
    end
    -- Comments are untyped now; only an older or agent-set type other than note is named.
    local title = { author_chunk(c.author) }
    if c.type ~= "note" then title[#title + 1] = { " " .. (info.name or c.type):lower(), type_hl } end
    title[#title + 1] = { " · " .. c.file .. " " .. range_label(c), "ReviewCardMeta" }
    local lines = { rule("╭", "╮", hl, title, width) }
    for i, l in ipairs(wrap(c.text, inner)) do
        lines[#lines + 1] = row(hl, { { l, i == 1 and "ReviewCardTitle" or "ReviewCardBody" } }, inner)
    end
    for _, r in ipairs(c.replies or {}) do
        local who = author_chunk(r.author)
        lines[#lines + 1] = rule("├", "┤", hl, { { "↳ ", hl }, who }, width)
        for _, l in ipairs(wrap(r.text, inner)) do
            lines[#lines + 1] = row(hl, { { l, "Normal" } }, inner)
        end
    end
    lines[#lines + 1] = rule("╰", "╯", hl, nil, width)
    return lines
end

-- The file review.nvim keys bufnr's comments under, or nil.
local function buffer_file(bufnr, file_override)
    local utils = require("review.utils")
    if file_override then return utils.normalize_path(file_override) end
    local hooks = require("review.hooks")
    local orig_buf, mod_buf = hooks.get_buffers()
    local orig_path, mod_path = hooks.get_paths()
    if bufnr == orig_buf and orig_path then return utils.normalize_path(orig_path) end
    if bufnr == mod_buf and mod_path then return utils.normalize_path(mod_path) end
    return hooks.plain_buffer_file(bufnr)
end

local function attach_row(c)
    return c.line == 0 and 0 or (c.line_end or c.line) - 1
end

-- Resolved comments are hidden until shown with toggle_show_resolved.
M.show_resolved = false

local function shown(c)
    return M.show_resolved or not c.resolved
end

-- The comments drawn in bufnr: the file's comments on `side`, less hidden resolved ones.
local function shown_for_file(file, side)
    return vim.tbl_filter(shown, store().get_for_file(file, side))
end

-- Swap review.nvim's boxes in bufnr for cards, keeping each extmark's id and other options.
-- A hidden comment's marks are removed.
local function restyle(bufnr, side, file_override)
    local file = buffer_file(bufnr, file_override)
    if not file then return end
    local by_row = {}
    for _, c in ipairs(shown_for_file(file, side)) do
        local r = attach_row(c)
        by_row[r] = by_row[r] or {}
        table.insert(by_row[r], c)
    end
    -- The comment covering each row, for the gutter bar.
    local covering = {}
    for _, list in pairs(by_row) do
        for _, c in ipairs(list) do
            local first = c.line == 0 and 0 or c.line - 1
            for r = first, attach_row(c) do covering[r] = covering[r] or c end
        end
    end
    local width = card_width(bufnr)
    -- review.nvim puts one extmark on every row a comment covers: an emoji sign on the first,
    -- the box on the last. Each becomes a bar in the author's colour, and the box a card.
    local marks = vim.api.nvim_buf_get_extmarks(bufnr, ns, 0, -1, { details = true })
    for _, m in ipairs(marks) do
        local id, r, col, d = m[1], m[2], m[3], m[4]
        local c = covering[r]
        local queue = by_row[r]
        local card = d.virt_lines and queue and #queue > 0 and table.remove(queue, 1) or nil
        if not (c or card) then
            pcall(vim.api.nvim_buf_del_extmark, bufnr, ns, id)
        else
            local owner = card or c
            local bar = owner.resolved and "ReviewBarResolved"
                or owner.author == "claude" and "ReviewBarClaude"
                or "ReviewBarYou"
            pcall(vim.api.nvim_buf_set_extmark, bufnr, ns, r, col, {
                id = id,
                sign_text = "▍",
                sign_hl_group = bar,
                line_hl_group = not owner.resolved and d.line_hl_group or nil,
                virt_lines = card and M.card(card, width) or nil,
                virt_lines_above = d.virt_lines_above,
            })
        end
    end
end

-- review.nvim's side-by-side padding, but with card heights (its own assumes text height + 2).
local function align_buffers(orig_buf, mod_buf, orig_file, mod_file)
    for _, b in ipairs({ orig_buf, mod_buf }) do
        if b and vim.api.nvim_buf_is_valid(b) then vim.api.nvim_buf_clear_namespace(b, ns_padding, 0, -1) end
    end
    if not (orig_buf and mod_buf and vim.api.nvim_buf_is_valid(orig_buf) and vim.api.nvim_buf_is_valid(mod_buf)) then
        return
    end
    local function heights(file, side, bufnr)
        local map = {}
        if not file then return map end
        local width = card_width(bufnr)
        for _, c in ipairs(shown_for_file(file, side)) do
            if c.line ~= 0 and (c.side or "new") == side then
                local r = attach_row(c)
                map[r] = (map[r] or 0) + #M.card(c, width)
            end
        end
        return map
    end
    local old = heights(orig_file, "old", orig_buf)
    local new = heights(mod_file, "new", mod_buf)
    local rows = vim.tbl_extend("keep", vim.deepcopy(old), new)
    for r in pairs(rows) do
        local diff = (old[r] or 0) - (new[r] or 0)
        if diff ~= 0 then
            local pad = {}
            for _ = 1, math.abs(diff) do pad[#pad + 1] = { { "", "Normal" } } end
            pcall(vim.api.nvim_buf_set_extmark, diff > 0 and mod_buf or orig_buf, ns_padding, r, 0, {
                virt_lines = pad,
            })
        end
    end
end

local function refresh_all()
    local marks = require("review.marks")
    marks.refresh()
    for _, win in ipairs(vim.api.nvim_tabpage_list_wins(0)) do
        local buf = vim.api.nvim_win_get_buf(win)
        if vim.bo[buf].buftype == "" then marks.render_plain_buffer(buf) end
    end
end

-- Threads -------------------------------------------------------------------

local function persist(c)
    store().update(c.id, c.text) -- writes the whole store, extra fields included
end

function M.reply(id, text, author)
    local c = store().get(id)
    if not c then return nil, "no comment " .. id end
    c.replies = c.replies or {}
    table.insert(c.replies, { author = author or "you", text = text, at = os.time() })
    persist(c)
    refresh_all()
    return c
end

---Marks a comment resolved, or open again; `resolved` absent toggles.
function M.set_resolved(id, resolved, by)
    local c = store().get(id)
    if not c then return nil, "no comment " .. id end
    if resolved == nil then resolved = not c.resolved end
    c.resolved = resolved or nil
    c.resolved_by = resolved and (by or "you") or nil
    persist(c)
    refresh_all()
    return c
end

function M.toggle_show_resolved()
    M.show_resolved = not M.show_resolved
    refresh_all()
    vim.notify(M.show_resolved and "Showing resolved comments" or "Hiding resolved comments")
end

function M.toggle_resolved_at_cursor()
    local file, line, side = require("review.hooks").get_cursor_position()
    local c = file and store().get_at_line(file, line, side)
    if not c then return vim.notify("No comment on this line", vim.log.levels.INFO) end
    M.set_resolved(c.id, nil, "you")
end

-- Marks the file viewed (or not) and moves to the next unviewed one, with review.nvim's own
-- toggle. Called directly: its buffer-local key is missing from some of a review tab's buffers.
function M.toggle_viewed()
    if vim.bo.filetype == "codediff-explorer" then
        local line = vim.fn.line(".")
        return M.toggle_viewed_rows(line, line)
    end
    local explorer = require("review.hooks").get_explorer(vim.api.nvim_get_current_tabpage())
    if not explorer then
        return vim.notify("Mark viewed works in a review tab", vim.log.levels.INFO)
    end
    require("review.reviewed").toggle_current(explorer)
end

-- Moving on to the next file in the list, by ]c past the last hunk or any other way, marks the
-- file left behind viewed. Going back or jumping elsewhere marks nothing.
local last_file = {} -- by tabpage: { path, group } of the file shown before this one

-- review.nvim's mark key for `file` ("<old blob> <new blob> <path>", review/reviewed.lua),
-- which it keeps private.
local function mark_key(explorer, file)
    local root = explorer.data.git_root
    local old, new = require("review.reviewed").sides(explorer.data, file)
    local specs = new and { old, new } or { old }
    local out = vim.fn.systemlist({ "git", "-C", root, "cat-file", "--batch-check=%(objectname)" }, specs)
    local old_blob = (out[1] or ""):match("^%x+$") or "missing"
    local new_blob
    if new then
        new_blob = (out[2] or ""):match("^%x+$") or "missing"
    elseif vim.uv.fs_stat(root .. "/" .. file.path) then
        new_blob = vim.fn.systemlist({ "git", "-C", root, "hash-object", "--", file.path })[1] or "missing"
    else
        new_blob = "missing"
    end
    return ("%s %s %s"):format(old_blob, new_blob, file.path)
end

-- "✓ reviewed/total" for the review in the current tab, for the statusline. Counted once and
-- kept until a mark or a file changes: counting hashes every file in the review.
local progress_cache = {} -- by tabpage

local function forget_progress() progress_cache = {} end

function M.progress()
    local tab = vim.api.nvim_get_current_tabpage()
    if progress_cache[tab] then return progress_cache[tab] end
    local explorer = require("review.hooks").get_explorer(tab)
    if not (explorer and explorer.data.git_root and explorer.tree) then return "" end
    local reviewed = require("review.reviewed")
    local files = require("codediff.ui.explorer.tree").get_all_files(explorer.tree)
    local done = 0
    for _, entry in ipairs(files) do
        if reviewed.is_reviewed(explorer, entry.data) then done = done + 1 end
    end
    progress_cache[tab] = ("✓ %d/%d"):format(done, #files)
    return progress_cache[tab]
end

local function mark_left_file_viewed(tab)
    local explorer = require("review.hooks").get_explorer(tab)
    if not (explorer and explorer.data.git_root) then return end
    local current = { path = explorer.data.current_file_path, group = explorer.data.current_file_group }
    local left = last_file[tab]
    last_file[tab] = current
    if not left then return end

    local files = vim.tbl_map(function(entry) return entry.data end,
        require("codediff.ui.explorer.tree").get_all_files(explorer.tree))
    local function index_of(f)
        for i, file in ipairs(files) do
            if file.path == f.path and file.group == f.group then return i end
        end
    end
    local from, to = index_of(left), index_of(current)
    if not (from and to and to == from + 1) then return end

    local reviewed = require("review.reviewed")
    local file = files[from]
    if reviewed.is_reviewed(explorer, file) then return end
    local storage = require("review.storage")
    local marks = storage.load_reviewed()
    marks[mark_key(explorer, file)] = os.time()
    storage.save_reviewed(marks)
    reviewed.reset() -- drops its cached marks and redraws the file panel
    vim.notify("Viewed " .. file.path, vim.log.levels.INFO, { title = "review.nvim" })
end

---Marks the files on rows `first`..`last` of the review's file panel viewed, or unmarks them
---when they all are already. For a visual selection in the panel.
function M.toggle_viewed_rows(first, last)
    local explorer = require("review.hooks").get_explorer(vim.api.nvim_get_current_tabpage())
    if not (explorer and explorer.data.git_root) then
        return vim.notify("Mark viewed works in a review tab", vim.log.levels.INFO)
    end
    local reviewed = require("review.reviewed")
    local files = {}
    for line = math.min(first, last), math.max(first, last) do
        local node = explorer.tree:get_node(line)
        local file = node and node.data
        if file and file.path and file.group then table.insert(files, file) end
    end
    if #files == 0 then return end

    local unmark = vim.iter(files):all(function(file) return reviewed.is_reviewed(explorer, file) end)
    local storage = require("review.storage")
    local marks = storage.load_reviewed()
    for _, file in ipairs(files) do
        marks[mark_key(explorer, file)] = not unmark and os.time() or nil
    end
    storage.save_reviewed(marks)
    reviewed.reset()
    vim.notify(("%s %d file%s"):format(unmark and "Unmarked" or "Viewed", #files, #files == 1 and "" or "s"),
        vim.log.levels.INFO, { title = "review.nvim" })
end

function M.reply_at_cursor()
    local file, line, side = require("review.hooks").get_cursor_position()
    local c = file and store().get_at_line(file, line, side)
    if not c then return vim.notify("No comment on this line", vim.log.levels.INFO) end
    vim.ui.input({ prompt = "Reply: " }, function(text)
        if text and vim.trim(text) ~= "" then M.reply(c.id, text, "you") end
    end)
end

-- Comment box ---------------------------------------------------------------

-- Replaces review.nvim's popup (a type picker over a text box) with one box under the cursor,
-- like an inline GitHub comment. Comments have no types: every one is saved as a note.
-- Same signature as review.popup.open, which review.comments calls through the module table.
function M.comment_input(initial_type, initial_text, callback)
    local Popup = require("nui.popup")
    local prev_win = vim.api.nvim_get_current_win()
    local width = math.min(72, vim.api.nvim_win_get_width(0) - 4)
    local popup = Popup({
        enter = true,
        relative = "cursor",
        position = { row = 1, col = 0 },
        size = { width = width, height = 6 },
        border = {
            style = "rounded",
            text = { top = " Comment ", top_align = "left", bottom = " normal-mode Enter save · q cancel ", bottom_align = "right" },
        },
        win_options = { winhighlight = "Normal:Normal,FloatBorder:FloatBorder", wrap = true, linebreak = true },
        buf_options = { filetype = "markdown" },
    })
    popup:mount()
    if initial_text and initial_text ~= "" then
        vim.api.nvim_buf_set_lines(popup.bufnr, 0, -1, false, vim.split(initial_text, "\n"))
    end

    local done = false
    local function close(text)
        if done then return end
        done = true
        popup:unmount()
        if vim.api.nvim_win_is_valid(prev_win) then vim.api.nvim_set_current_win(prev_win) end
        vim.cmd("stopinsert")
        if text and text ~= "" then callback(initial_type or "note", text) else callback(nil, nil) end
    end
    local function submit()
        local text = table.concat(vim.api.nvim_buf_get_lines(popup.bufnr, 0, -1, false), "\n"):gsub("%s+$", "")
        close(text)
    end
    -- Enter in insert mode is a new line, as in any text; Enter in normal mode saves.
    popup:map("n", "<CR>", submit, { noremap = true })
    popup:map("n", "q", function() close(nil) end, { noremap = true })
    popup:map("n", "<Esc>", function() close(nil) end, { noremap = true })
    popup:on("BufLeave", function() close(nil) end)
    if not initial_text or initial_text == "" then vim.cmd("startinsert") end
end

-- Agent API (JSON in, JSON out) ---------------------------------------------

local function goto_comment(c)
    local tab = vim.api.nvim_get_current_tabpage()
    local explorer = require("review.hooks").get_explorer(tab)
    if explorer then
        for _, node in ipairs(require("codediff.ui.explorer.tree").get_all_files(explorer.tree)) do
            if node.data.path == c.file then
                explorer.on_file_select(node.data)
                break
            end
        end
    else
        vim.cmd.edit(vim.fn.fnameescape(require("review.utils").git_root() .. "/" .. c.file))
    end
    vim.defer_fn(function()
        if explorer then
            local orig_win, mod_win = require("codediff.ui.lifecycle").get_windows(tab)
            local win = c.side == "old" and orig_win or mod_win
            if win and vim.api.nvim_win_is_valid(win) then vim.api.nvim_set_current_win(win) end
        end
        pcall(vim.api.nvim_win_set_cursor, 0, { math.max(c.line, 1), 0 })
        vim.cmd("normal! zz")
    end, 150)
end

-- The open review's file panel: the current tab's, else the first tab that has one.
local function review_explorer()
    local hooks = require("review.hooks")
    local tabs = vim.list_extend({ vim.api.nvim_get_current_tabpage() }, vim.api.nvim_list_tabpages())
    for _, tab in ipairs(tabs) do
        local explorer = hooks.get_explorer(tab)
        if explorer and explorer.data.git_root then return explorer end
    end
    error("no review file panel open", 0)
end

local function review_files(explorer)
    return vim.tbl_map(function(entry) return entry.data end,
        require("codediff.ui.explorer.tree").get_all_files(explorer.tree))
end

local handlers = {
    list = function()
        return store().get_all()
    end,
    files = function()
        local explorer = review_explorer()
        local reviewed = require("review.reviewed")
        return vim.tbl_map(function(file)
            return { path = file.path, group = file.group, reviewed = reviewed.is_reviewed(explorer, file) }
        end, review_files(explorer))
    end,
    reviewed = function(a)
        local explorer = review_explorer()
        local wanted = {}
        for _, path in ipairs(a.files) do wanted[path] = false end
        local storage = require("review.storage")
        local marks = storage.load_reviewed()
        for _, file in ipairs(review_files(explorer)) do
            if wanted[file.path] ~= nil then
                wanted[file.path] = true
                marks[mark_key(explorer, file)] = a.reviewed ~= false and os.time() or nil
            end
        end
        local missing = vim.tbl_filter(function(path) return not wanted[path] end, a.files)
        if #missing > 0 then error("not in this review: " .. table.concat(missing, ", "), 0) end
        storage.save_reviewed(marks)
        require("review.reviewed").reset()
        if vim.api.nvim_buf_is_valid(explorer.bufnr) and not explorer.is_hidden then explorer.tree:render() end
        return { files = a.files, reviewed = a.reviewed ~= false }
    end,
    add = function(a)
        local s = store()
        local c = s.add(a.file, a.line, a.type or "note", a.text, a.line_end, a.side or "new")
        c.author = a.author or "claude"
        persist(c)
        refresh_all()
        if a.focus then goto_comment(c) end
        return c
    end,
    reply = function(a)
        local c, err = M.reply(a.id, a.text, a.author or "claude")
        if not c then error(err, 0) end
        if a.focus then goto_comment(c) end
        return c
    end,
    resolve = function(a)
        local c, err = M.set_resolved(a.id, a.resolved ~= false, a.author or "claude")
        if not c then error(err, 0) end
        return c
    end,
    ["goto"] = function(a)
        local c = store().get(a.id)
        if not c then error("no comment " .. a.id, 0) end
        goto_comment(c)
        return c
    end,
    rm = function(a)
        store().delete(a.id)
        refresh_all()
        return { deleted = a.id }
    end,
}

---Entry point for `rv`: takes and returns a JSON string.
function M.call(json)
    local ok, req = pcall(vim.json.decode, json)
    if not ok then return vim.json.encode({ error = "bad request json" }) end
    local handler = handlers[req.cmd]
    if not handler then return vim.json.encode({ error = "unknown command " .. tostring(req.cmd) }) end
    local hok, result = pcall(handler, req)
    if not hok then return vim.json.encode({ error = tostring(result) }) end
    return vim.json.encode({ ok = true, result = result, cwd = vim.fn.getcwd() })
end

-- Setup -----------------------------------------------------------------------

function M.setup()
    set_highlights()
    local marks = require("review.marks")
    local render = marks.render_for_buffer
    marks.render_for_buffer = function(bufnr, side, file_override)
        render(bufnr, side, file_override)
        if bufnr and vim.api.nvim_buf_is_valid(bufnr) then restyle(bufnr, side, file_override) end
    end
    marks.align_buffers = align_buffers
    require("review.popup").open = M.comment_input

    -- Sending a review leaves resolved comments out.
    local export = require("review.export")
    local generate = export.generate_markdown
    export.generate_markdown = function(...)
        local s = store()
        local get_all = s.get_all
        s.get_all = function()
            return vim.tbl_filter(function(c) return not c.resolved end, get_all())
        end
        local ok, result = pcall(generate, ...)
        s.get_all = get_all
        if not ok then error(result, 0) end
        return result
    end

    local group = vim.api.nvim_create_augroup("review-ext", { clear = true })
    vim.api.nvim_create_autocmd("ColorScheme", { group = group, callback = set_highlights })
    vim.api.nvim_create_autocmd({ "WinResized", "VimResized" }, {
        group = group,
        callback = function() pcall(refresh_all) end,
    })
    vim.api.nvim_create_autocmd("User", {
        group = group,
        pattern = "CodeDiffFileSelect",
        callback = function(args)
            local tab = (args.data or {}).tabpage or vim.api.nvim_get_current_tabpage()
            vim.schedule(function() pcall(mark_left_file_viewed, tab) end)
        end,
    })
    vim.api.nvim_create_autocmd("TabClosed", { group = group, callback = function() last_file = {} end })

    -- Every way a mark changes ends in review.nvim's reset (its own toggle saves, then redraws;
    -- review_ext's marks call reset), and an edited file drops its mark.
    local reviewed = require("review.reviewed")
    for _, name in ipairs({ "reset", "toggle_current" }) do
        local inner = reviewed[name]
        reviewed[name] = function(...)
            forget_progress()
            return inner(...)
        end
    end
    vim.api.nvim_create_autocmd({ "BufWritePost", "FocusGained" }, { group = group, callback = forget_progress })
    vim.keymap.set("n", "<localleader>cR", M.reply_at_cursor, { desc = "Review: reply to the comment here" })
end

return M
