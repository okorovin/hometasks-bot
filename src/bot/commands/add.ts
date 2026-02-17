import type { Context } from "grammy"
import { getOrCreateUser } from "../../services/user.service.js"
import * as taskService from "../../services/task.service.js"
import * as llmService from "../../services/llm.service.js"
import { formatTaskCard } from "../formatters/task.js"
import { taskCardKeyboard } from "../keyboards/task-card.js"

export async function addCommand(ctx: Context): Promise<void> {
    if (!ctx.from) return

    const text = ctx.match as string | undefined
    if (!text || text.trim().length === 0) {
        await ctx.reply("Send me the task text after /add, or just send a message directly.")
        return
    }

    const user = await getOrCreateUser(BigInt(ctx.from.id))
    const parsed = await llmService.parseTaskFromText(text.trim(), user.timezone)

    let dueAt: Date | null = null
    if (parsed.dueAt) {
        const parsedDate = new Date(parsed.dueAt)
        if (!isNaN(parsedDate.getTime())) {
            dueAt = parsedDate
        }
    }

    const task = await taskService.createTask({
        userId: user.id,
        title: parsed.title,
        notes: parsed.notes,
        dueAt,
    })

    const fullTask = await taskService.getTaskById(task.id)
    if (!fullTask) return

    const cardText = formatTaskCard(fullTask, user.timezone)
    const msg = await ctx.reply(cardText, {
        parse_mode: "HTML",
        reply_markup: taskCardKeyboard(fullTask),
    })

    await taskService.updateCardMessageId(task.id, msg.message_id)
}
