import type { Context } from "grammy"
import { getOrCreateUser } from "../../services/user.service.js"
import * as taskService from "../../services/task.service.js"
import { formatTaskListItem } from "../formatters/task.js"
import { paginate, taskListKeyboard } from "../../utils/pagination.js"

export async function allCommand(ctx: Context): Promise<void> {
    if (!ctx.from) return

    const user = await getOrCreateUser(BigInt(ctx.from.id))
    const tasks = await taskService.getAll(user.id)

    if (tasks.length === 0) {
        await ctx.reply("📋 No active tasks.")
        return
    }

    const page = 1
    const { items, totalPages, total } = paginate(tasks, page)
    const pageOffset = (page - 1) * 5

    const lines = items.map((t, i) =>
        formatTaskListItem(t, user.timezone, pageOffset + i),
    )

    const text = `📋 <b>All tasks</b> (${total}):\n\n${lines.join("\n")}`
    const kb = taskListKeyboard(items, "all", page, totalPages, pageOffset)
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb })
}
