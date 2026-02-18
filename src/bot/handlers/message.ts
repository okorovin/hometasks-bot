import type { Context } from "grammy"
import { getOrCreateUser } from "../../services/user.service.js"
import * as taskService from "../../services/task.service.js"
import * as llmService from "../../services/llm.service.js"
import { formatTaskCard } from "../formatters/task.js"
import { taskCardKeyboard } from "../keyboards/task-card.js"
import { notifyError } from "../../utils/error-notifier.js"
import { logger } from "../../logger.js"

// Track users waiting for input (edit title, custom date, etc.)
export const awaitingInput = new Map<
    number,
    { action: string; taskId: number }
>()

export async function handleMessage(ctx: Context): Promise<void> {
    if (!ctx.message?.text || !ctx.from) return

    const text = ctx.message.text
    const telegramUserId = BigInt(ctx.from.id)

    // Check if user is in "awaiting input" mode
    const pending = awaitingInput.get(ctx.from.id)
    if (pending) {
        awaitingInput.delete(ctx.from.id)
        await handlePendingInput(ctx, pending, text)
        return
    }

    // Skip commands — they're handled by command handlers
    if (text.startsWith("/")) return

    try {
        const user = await getOrCreateUser(telegramUserId)
        const isForward = !!ctx.message.forward_origin

        let parsed: llmService.ParsedTask
        let notes: string | null = null

        if (isForward) {
            notes = text
            parsed = await llmService.parseTaskFromForward(
                text,
                user.timezone,
            )
        } else {
            parsed = await llmService.parseTaskFromText(text, user.timezone)
            notes = parsed.notes
        }

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
            notes,
            dueAt,
            sourceType: isForward ? "FORWARD" : "TEXT",
        })

        // Load task with repeat rule for formatting
        const fullTask = await taskService.getTaskById(task.id)
        if (!fullTask) return

        const cardText = formatTaskCard(fullTask, user.timezone)
        const msg = await ctx.reply(cardText, {
            parse_mode: "HTML",
            reply_markup: taskCardKeyboard(fullTask),
        })

        // Save card message ID for in-place editing
        await taskService.updateCardMessageId(task.id, msg.message_id)
    } catch (error) {
        logger.error({ err: error }, "Failed to create task from message")
        await notifyError(
            error,
            "task creation",
            telegramUserId,
        )
    }
}

async function handlePendingInput(
    ctx: Context,
    pending: { action: string; taskId: number },
    text: string,
): Promise<void> {
    if (!ctx.from) return
    const telegramUserId = BigInt(ctx.from.id)

    try {
        const user = await getOrCreateUser(telegramUserId)

        if (pending.action === "edit_title") {
            const task = await taskService.updateTitle(pending.taskId, text)
            const fullTask = await taskService.getTaskById(task.id)
            if (!fullTask) return

            const cardText = formatTaskCard(fullTask, user.timezone)

            if (fullTask.cardMessageId) {
                await ctx.api.editMessageText(
                    ctx.chat!.id,
                    fullTask.cardMessageId,
                    cardText,
                    {
                        parse_mode: "HTML",
                        reply_markup: taskCardKeyboard(fullTask),
                    },
                )
                await ctx.reply("✅ Title updated!")
            } else {
                await ctx.reply(cardText, {
                    parse_mode: "HTML",
                    reply_markup: taskCardKeyboard(fullTask),
                })
            }
        } else if (pending.action === "set_due_date") {
            // Parse date from user text via LLM
            const parsed = await llmService.parseTaskFromText(
                `Set date: ${text}`,
                user.timezone,
            )

            let dueAt: Date | null = null
            if (parsed.dueAt) {
                const parsedDate = new Date(parsed.dueAt)
                if (!isNaN(parsedDate.getTime())) {
                    dueAt = parsedDate
                }
            }

            if (!dueAt) {
                await ctx.reply("⚠️ Could not parse date. Try again, e.g.: \"March 15\", \"Friday 18:00\", \"25.02 at 10:00\"")
                // Re-set awaiting so user can try again
                awaitingInput.set(ctx.from.id, pending)
                return
            }

            await taskService.setDueDate(pending.taskId, dueAt)
            const fullTask = await taskService.getTaskById(pending.taskId)
            if (!fullTask) return

            const cardText = formatTaskCard(fullTask, user.timezone)

            if (fullTask.cardMessageId) {
                await ctx.api.editMessageText(
                    ctx.chat!.id,
                    fullTask.cardMessageId,
                    cardText,
                    {
                        parse_mode: "HTML",
                        reply_markup: taskCardKeyboard(fullTask),
                    },
                )
                await ctx.reply("✅ Due date set!")
            } else {
                await ctx.reply(cardText, {
                    parse_mode: "HTML",
                    reply_markup: taskCardKeyboard(fullTask),
                })
            }
        }
    } catch (error) {
        logger.error({ err: error }, "Failed to handle pending input")
        await notifyError(error, "pending input", telegramUserId)
    }
}
