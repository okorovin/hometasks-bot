import type { Context } from "grammy"
import { getOrCreateUser } from "../../services/user.service.js"
import * as tagService from "../../services/tag.service.js"
import * as taskService from "../../services/task.service.js"
import { formatTaskListItem } from "../formatters/task.js"
import { paginate, taskListKeyboard } from "../../utils/pagination.js"

export async function tagsCommand(ctx: Context): Promise<void> {
    if (!ctx.from) return

    const user = await getOrCreateUser(BigInt(ctx.from.id))
    const tags = await tagService.getUserTags(user.id)

    if (tags.length === 0) {
        await ctx.reply("🏷 No tags yet. Tags are created automatically when you add tasks.")
        return
    }

    const lines = tags.map(t => `🏷 <b>${escapeHtml(t.name)}</b> — ${t._count.taskTags} task(s)`)
    await ctx.reply(`🏷 <b>Your tags</b>:\n\n${lines.join("\n")}`, { parse_mode: "HTML" })
}

export async function tagFilterCommand(ctx: Context): Promise<void> {
    if (!ctx.from) return

    const user = await getOrCreateUser(BigInt(ctx.from.id))
    const tagName = ctx.message?.text?.replace(/^\/tag\s*/, "").trim()

    if (!tagName) {
        await ctx.reply("Usage: /tag <name>\nExample: /tag дом")
        return
    }

    const taskIds = await tagService.getTasksByTag(user.id, tagName)
    if (taskIds.length === 0) {
        await ctx.reply(`🏷 No active tasks with tag "${tagName}".`)
        return
    }

    const allTasks = await taskService.getAll(user.id)
    const filtered = allTasks.filter(t => taskIds.includes(t.id))

    const page = 1
    const { items, totalPages, total } = paginate(filtered, page)
    const pageOffset = (page - 1) * 5
    const lines = items.map((t, i) => formatTaskListItem(t, user.timezone, pageOffset + i))

    const text = `🏷 <b>Tag: ${escapeHtml(tagName)}</b> (${total} tasks):\n\n${lines.join("\n")}`
    const kb = taskListKeyboard(items, `tagfilter_${tagName}`, page, totalPages, pageOffset)
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb })
}

function escapeHtml(text: string): string {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}
