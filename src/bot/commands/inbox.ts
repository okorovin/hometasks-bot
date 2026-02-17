import type { Context } from "grammy"
import { getOrCreateUser } from "../../services/user.service.js"
import * as taskService from "../../services/task.service.js"
import { formatTaskListItem } from "../formatters/task.js"
import { paginate, paginationKeyboard } from "../../utils/pagination.js"

export async function inboxCommand(ctx: Context): Promise<void> {
    if (!ctx.from) return

    const user = await getOrCreateUser(BigInt(ctx.from.id))
    const tasks = await taskService.getInbox(user.id)

    if (tasks.length === 0) {
        await ctx.reply("📥 Inbox is empty.")
        return
    }

    const page = 1
    const { items, totalPages, total } = paginate(tasks, page)

    const lines = items.map((t, i) =>
        formatTaskListItem(t, user.timezone, (page - 1) * 5 + i),
    )

    const text = `📥 <b>Inbox</b> (${total} tasks):\n\n${lines.join("\n")}`
    const kb = paginationKeyboard("inbox", page, totalPages)
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb })
}
