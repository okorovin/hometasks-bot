import type { Context } from "grammy"
import * as taskService from "../../services/task.service.js"
import * as repeatService from "../../services/repeat.service.js"
import { getOrCreateUser } from "../../services/user.service.js"
import { formatTaskCard, formatTaskListItem } from "../formatters/task.js"
import {
    taskCardKeyboard,
    postponeKeyboard,
    repeatKeyboard,
    deleteConfirmKeyboard,
    setDueKeyboard,
} from "../keyboards/task-card.js"
import { awaitingInput } from "./message.js"
import { dateAtTimeInTz } from "../../utils/date.js"
import { paginate, paginationKeyboard } from "../../utils/pagination.js"
import { notifyError } from "../../utils/error-notifier.js"
import { logger } from "../../logger.js"
import type { RepeatUnit } from "@prisma/client"

export async function handleCallback(ctx: Context): Promise<void> {
    const data = ctx.callbackQuery?.data
    if (!data || !ctx.from) return

    await ctx.answerCallbackQuery()

    const telegramUserId = BigInt(ctx.from.id)

    try {
        const user = await getOrCreateUser(telegramUserId)
        const parts = data.split(":")

        // Handle pagination: "today:page:2", "inbox:page:1", etc.
        if (parts[1] === "page") {
            await handlePagination(
                ctx,
                parts[0]!,
                parseInt(parts[2]!, 10),
                user.id,
                user.timezone,
            )
            return
        }

        const action = parts[0]
        const taskId = parts[1] ? parseInt(parts[1], 10) : NaN

        if (action === "noop" || isNaN(taskId)) return

        switch (action) {
            case "done":
                await handleDone(ctx, taskId, user.timezone)
                break
            case "postpone":
                await handlePostponeMenu(ctx, taskId)
                break
            case "postpone_do":
                await handlePostponeDo(ctx, taskId, parts[2]!, user.timezone)
                break
            case "setdue":
                await handleSetDueMenu(ctx, taskId)
                break
            case "setdue_do":
                await handleSetDueDo(ctx, taskId, parts[2]!, user.timezone)
                break
            case "repeat":
                await handleRepeatMenu(ctx, taskId)
                break
            case "repeat_set":
                await handleRepeatSet(
                    ctx,
                    taskId,
                    parseInt(parts[2]!, 10),
                    parts[3] as RepeatUnit,
                    user.timezone,
                )
                break
            case "repeat_remove":
                await handleRepeatRemove(ctx, taskId, user.timezone)
                break
            case "edit":
                await handleEdit(ctx, taskId)
                break
            case "delete":
                await handleDeleteConfirm(ctx, taskId)
                break
            case "confirm_delete":
                await handleDelete(ctx, taskId)
                break
            case "back":
                await handleBack(ctx, taskId, user.timezone)
                break
            case "open":
                await handleOpen(ctx, taskId, user.timezone)
                break
            default:
                // Handle list pagination callbacks
                if (data.includes(":page:")) {
                    // Pagination handled in command handlers
                }
                break
        }
    } catch (error) {
        logger.error({ err: error, data }, "Callback handler error")
        await notifyError(error, "callback handler", telegramUserId)
    }
}

async function editCard(
    ctx: Context,
    taskId: number,
    timezone: string,
    keyboard?: ReturnType<typeof taskCardKeyboard>,
): Promise<void> {
    const task = await taskService.getTaskById(taskId)
    if (!task) return

    const text = formatTaskCard(task, timezone)
    const kb = keyboard ?? taskCardKeyboard(task)

    await ctx.editMessageText(text, {
        parse_mode: "HTML",
        reply_markup: kb,
    })
}

async function handleDone(
    ctx: Context,
    taskId: number,
    timezone: string,
): Promise<void> {
    const result = await taskService.completeTask(taskId)

    // If a new repeated task was created, result is the new task
    const task = await taskService.getTaskById(taskId)

    if (task && task.status === "DONE") {
        await ctx.editMessageText(
            `✅ <b>${escapeHtml(task.title)}</b> — done!`,
            { parse_mode: "HTML" },
        )
    }

    // If repeat created a new task, send its card
    if (result.id !== taskId) {
        const newTask = await taskService.getTaskById(result.id)
        if (newTask) {
            const cardText = formatTaskCard(newTask, timezone)
            const msg = await ctx.reply(
                `🔁 Repeat created:\n\n${cardText}`,
                {
                    parse_mode: "HTML",
                    reply_markup: taskCardKeyboard(newTask),
                },
            )
            await taskService.updateCardMessageId(
                newTask.id,
                msg.message_id,
            )
        }
    }
}

async function handlePostponeMenu(
    ctx: Context,
    taskId: number,
): Promise<void> {
    await ctx.editMessageReplyMarkup({
        reply_markup: postponeKeyboard(taskId),
    })
}

async function handlePostponeDo(
    ctx: Context,
    taskId: number,
    value: string,
    timezone: string,
): Promise<void> {
    if (value === "tomorrow") {
        const tomorrow = dateAtTimeInTz(timezone, 9, 0)
        tomorrow.setDate(tomorrow.getDate() + 1)
        await taskService.setDueDate(taskId, tomorrow)
    } else {
        const minutes = parseInt(value, 10)
        if (!isNaN(minutes)) {
            await taskService.postponeTask(taskId, minutes)
        }
    }
    await editCard(ctx, taskId, timezone)
}

async function handleSetDueMenu(
    ctx: Context,
    taskId: number,
): Promise<void> {
    await ctx.editMessageReplyMarkup({
        reply_markup: setDueKeyboard(taskId),
    })
}

async function handleSetDueDo(
    ctx: Context,
    taskId: number,
    value: string,
    timezone: string,
): Promise<void> {
    let targetDate: Date

    switch (value) {
        case "today_9":
            targetDate = dateAtTimeInTz(timezone, 9, 0)
            break
        case "today_18":
            targetDate = dateAtTimeInTz(timezone, 18, 0)
            break
        case "tomorrow_9":
            targetDate = dateAtTimeInTz(timezone, 9, 0)
            targetDate.setDate(targetDate.getDate() + 1)
            break
        case "tomorrow_18":
            targetDate = dateAtTimeInTz(timezone, 18, 0)
            targetDate.setDate(targetDate.getDate() + 1)
            break
        default:
            return
    }

    await taskService.setDueDate(taskId, targetDate)
    await editCard(ctx, taskId, timezone)
}

async function handleRepeatMenu(
    ctx: Context,
    taskId: number,
): Promise<void> {
    await ctx.editMessageReplyMarkup({
        reply_markup: repeatKeyboard(taskId),
    })
}

async function handleRepeatSet(
    ctx: Context,
    taskId: number,
    everyN: number,
    unit: RepeatUnit,
    timezone: string,
): Promise<void> {
    await repeatService.setRule(taskId, everyN, unit)
    await editCard(ctx, taskId, timezone)
}

async function handleRepeatRemove(
    ctx: Context,
    taskId: number,
    timezone: string,
): Promise<void> {
    await repeatService.removeRule(taskId)
    await editCard(ctx, taskId, timezone)
}

async function handleEdit(ctx: Context, taskId: number): Promise<void> {
    if (!ctx.from) return
    awaitingInput.set(ctx.from.id, {
        action: "edit_title",
        taskId,
    })
    await ctx.reply("✏️ Send new title for this task:")
}

async function handleDeleteConfirm(
    ctx: Context,
    taskId: number,
): Promise<void> {
    await ctx.editMessageReplyMarkup({
        reply_markup: deleteConfirmKeyboard(taskId),
    })
}

async function handleDelete(ctx: Context, taskId: number): Promise<void> {
    const task = await taskService.deleteTask(taskId)
    await ctx.editMessageText(
        `🗑 <b>${escapeHtml(task.title)}</b> — deleted`,
        { parse_mode: "HTML" },
    )
}

async function handleBack(
    ctx: Context,
    taskId: number,
    timezone: string,
): Promise<void> {
    await editCard(ctx, taskId, timezone)
}

async function handleOpen(
    ctx: Context,
    taskId: number,
    timezone: string,
): Promise<void> {
    const task = await taskService.getTaskById(taskId)
    if (!task) {
        await ctx.reply("Task not found.")
        return
    }
    const cardText = formatTaskCard(task, timezone)
    const msg = await ctx.reply(cardText, {
        parse_mode: "HTML",
        reply_markup: taskCardKeyboard(task),
    })
    await taskService.updateCardMessageId(task.id, msg.message_id)
}

async function handlePagination(
    ctx: Context,
    listType: string,
    page: number,
    userId: number,
    timezone: string,
): Promise<void> {
    let tasks: Awaited<ReturnType<typeof taskService.getAll>>
    let title: string

    switch (listType) {
        case "today":
            tasks = await taskService.getToday(userId, timezone)
            title = "📋 <b>Today</b>"
            break
        case "inbox":
            tasks = await taskService.getInbox(userId)
            title = "📥 <b>Inbox</b>"
            break
        case "overdue":
            tasks = await taskService.getOverdue(userId, timezone)
            title = "⚠️ <b>Overdue</b>"
            break
        case "week":
            tasks = await taskService.getWeek(userId, timezone)
            title = "📅 <b>This week</b>"
            break
        case "all":
            tasks = await taskService.getAll(userId)
            title = "📋 <b>All tasks</b>"
            break
        default:
            return
    }

    const { items, totalPages, total } = paginate(tasks, page)
    const lines = items.map((t, i) =>
        formatTaskListItem(t, timezone, (page - 1) * 5 + i),
    )

    const text = `${title} (${total} tasks):\n\n${lines.join("\n")}`
    const kb = paginationKeyboard(listType, page, totalPages)

    await ctx.editMessageText(text, {
        parse_mode: "HTML",
        reply_markup: kb,
    })
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
}
