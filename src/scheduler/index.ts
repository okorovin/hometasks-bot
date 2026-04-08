import type { Bot, Context } from "grammy"
import { getPrisma } from "../db/index.js"
import * as reminderService from "../services/reminder.service.js"
import { formatTaskCard } from "../bot/formatters/task.js"
import { taskCardKeyboard } from "../bot/keyboards/task-card.js"
import * as taskService from "../services/task.service.js"
import {
    isQuietHours,
    isTimeInQuietHours,
    getHoursMinutes,
    startOfDayInTz,
    endOfDayInTz,
} from "../utils/date.js"
import { notifyError } from "../utils/error-notifier.js"
import { logger } from "../logger.js"

const TELEGRAM_MSG_LIMIT = 4000

function splitMessage(text: string, limit: number): string[] {
    if (text.length <= limit) return [text]

    const chunks: string[] = []
    const lines = text.split("\n")
    let current = ""

    for (const line of lines) {
        if (current.length + line.length + 1 > limit && current.length > 0) {
            chunks.push(current.trimEnd())
            current = ""
        }
        current += (current ? "\n" : "") + line
    }
    if (current) {
        chunks.push(current.trimEnd())
    }

    return chunks
}

const TICK_INTERVAL = 60_000 // 60 seconds
let intervalId: ReturnType<typeof setInterval> | null = null

// Track when digest was last sent per user (to avoid re-sending in same day)
const lastDigestSent = new Map<number, string>()
// Track when overdue notifications were last sent per user (daily)
const lastOverdueSent = new Map<number, string>()

export function startScheduler(bot: Bot<Context>): void {
    logger.info("Scheduler started (60s interval)")

    intervalId = setInterval(async () => {
        try {
            await tick(bot)
        } catch (error) {
            logger.error({ err: error }, "Scheduler tick error")
            await notifyError(error, "scheduler")
        }
    }, TICK_INTERVAL)

    // Also run immediately
    tick(bot).catch((err) => {
        logger.error({ err }, "Initial scheduler tick error")
    })
}

export function stopScheduler(): void {
    if (intervalId) {
        clearInterval(intervalId)
        intervalId = null
        logger.info("Scheduler stopped")
    }
}

async function tick(bot: Bot<Context>): Promise<void> {
    await processDueReminders(bot)
    await processDigest(bot)
    await processOverdue(bot)
}

/**
 * 1. Due reminders: send reminders where remind_at <= NOW() and state = SCHEDULED
 */
async function processDueReminders(bot: Bot<Context>): Promise<void> {
    const reminders = await reminderService.getDueReminders()

    for (const reminder of reminders) {
        const { task } = reminder
        const user = task.user

        // Check quiet hours — if in quiet hours, skip (will be picked up next tick after quiet hours)
        if (
            isTimeInQuietHours(
                new Date(),
                user.timezone,
                user.quietFrom,
                user.quietTo,
            )
        ) {
            continue
        }

        try {
            const fullTask = await taskService.getTaskById(task.id)
            if (!fullTask || fullTask.status !== "ACTIVE") {
                await reminderService.markSent(reminder.id)
                continue
            }

            const cardText = `⏰ <b>Reminder!</b>\n\n${formatTaskCard(fullTask, user.timezone)}`
            const msg = await bot.api.sendMessage(
                Number(user.telegramUserId),
                cardText,
                {
                    parse_mode: "HTML",
                    reply_markup: taskCardKeyboard(fullTask),
                },
            )
            await taskService.updateCardMessageId(fullTask.id, msg.message_id)
            await reminderService.markSent(reminder.id)
        } catch (error) {
            logger.error(
                { err: error, reminderId: reminder.id },
                "Failed to send reminder",
            )
            await notifyError(
                error,
                `reminder for "${task.title}"`,
                user.telegramUserId,
            )
        }
    }
}

/**
 * 2. Daily digest at digest_time for each user
 */
async function processDigest(bot: Bot<Context>): Promise<void> {
    const prisma = getPrisma()
    const users = await prisma.user.findMany()
    const now = new Date()

    for (const user of users) {
        const todayKey = now.toLocaleDateString("en-US", {
            timeZone: user.timezone,
        })

        // Already sent today?
        if (lastDigestSent.get(user.id) === todayKey) continue

        // Check if it's digest time
        const { hours, minutes } = getHoursMinutes(user.digestTime)
        const tzNow = new Date(
            now.toLocaleString("en-US", { timeZone: user.timezone }),
        )
        const currentMinutes = tzNow.getHours() * 60 + tzNow.getMinutes()
        const digestMinutes = hours * 60 + minutes

        // Allow 2-minute window for the tick
        if (
            currentMinutes < digestMinutes ||
            currentMinutes > digestMinutes + 2
        ) {
            continue
        }

        // Check quiet hours
        if (isQuietHours(user.timezone, user.quietFrom, user.quietTo)) {
            continue
        }

        try {
            const overdue = await taskService.getOverdue(
                user.id,
                user.timezone,
            )
            const today = await taskService.getToday(
                user.id,
                user.timezone,
            )
            const inbox = await taskService.getInbox(user.id)

            if (
                overdue.length === 0 &&
                today.length === 0 &&
                inbox.length === 0
            ) {
                lastDigestSent.set(user.id, todayKey)
                continue
            }

            const lines: string[] = ["📬 <b>Daily Digest</b>\n"]

            if (overdue.length > 0) {
                lines.push(`⚠️ <b>Overdue: ${overdue.length} task(s)</b>`)
                for (const t of overdue) {
                    lines.push(`  • ${t.title}`)
                }
                lines.push("")
            }

            if (today.length > 0) {
                lines.push(`📋 <b>Today: ${today.length} task(s)</b>`)
                for (const t of today) {
                    lines.push(`  • ${t.title}`)
                }
                lines.push("")
            }

            if (inbox.length > 0) {
                lines.push(`📥 <b>Inbox: ${inbox.length} task(s)</b>`)
                for (const t of inbox) {
                    lines.push(`  • ${t.title}`)
                }
                lines.push("")
            }

            const fullText = lines.join("\n")
            const chunks = splitMessage(fullText, 4000)

            for (const chunk of chunks) {
                await bot.api.sendMessage(
                    Number(user.telegramUserId),
                    chunk,
                    { parse_mode: "HTML" },
                )
            }

            lastDigestSent.set(user.id, todayKey)
        } catch (error) {
            logger.error(
                { err: error, userId: user.id },
                "Failed to send digest",
            )
            await notifyError(error, "digest", user.telegramUserId)
        }
    }
}

/**
 * 3. Overdue reminders — once per day at digest time
 */
async function processOverdue(bot: Bot<Context>): Promise<void> {
    const prisma = getPrisma()
    const users = await prisma.user.findMany()
    const now = new Date()

    for (const user of users) {
        const todayKey = now.toLocaleDateString("en-US", {
            timeZone: user.timezone,
        })

        if (lastOverdueSent.get(user.id) === todayKey) continue

        // Send overdue reminders at digest_time + 1 minute (right after digest)
        const { hours, minutes } = getHoursMinutes(user.digestTime)
        const tzNow = new Date(
            now.toLocaleString("en-US", { timeZone: user.timezone }),
        )
        const currentMinutes = tzNow.getHours() * 60 + tzNow.getMinutes()
        const targetMinutes = hours * 60 + minutes + 1

        if (
            currentMinutes < targetMinutes ||
            currentMinutes > targetMinutes + 2
        ) {
            continue
        }

        if (isQuietHours(user.timezone, user.quietFrom, user.quietTo)) {
            continue
        }

        try {
            const overdue = await taskService.getOverdue(
                user.id,
                user.timezone,
            )

            for (const task of overdue) {
                const fullTask = await taskService.getTaskById(task.id)
                if (!fullTask) continue

                const cardText = `⚠️ <b>Overdue!</b>\n\n${formatTaskCard(fullTask, user.timezone)}`
                const msg = await bot.api.sendMessage(
                    Number(user.telegramUserId),
                    cardText,
                    {
                        parse_mode: "HTML",
                        reply_markup: taskCardKeyboard(fullTask),
                    },
                )
                await taskService.updateCardMessageId(
                    fullTask.id,
                    msg.message_id,
                )
            }

            lastOverdueSent.set(user.id, todayKey)
        } catch (error) {
            logger.error(
                { err: error, userId: user.id },
                "Failed to send overdue reminders",
            )
            await notifyError(error, "overdue reminders", user.telegramUserId)
        }
    }
}
