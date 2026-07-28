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
    formatDate,
} from "../utils/date.js"
import { notifyError } from "../utils/error-notifier.js"
import {
    isGmailEnabled,
    getNotifyChatId,
    fetchNewEmails,
    saveCursor,
    formatDigest,
} from "../services/gmail.service.js"
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

// Gmail digest: check at most once per hour
const GMAIL_INTERVAL_MS = 60 * 60 * 1000
let lastGmailCheck: number | null = null

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
    await processGmail(bot)
}

/**
 * 4. Gmail hourly digest: list new inbox emails and send them to the configured
 * recipient. Skips entirely during quiet hours (cursor not advanced), so
 * overnight emails arrive in one digest right after quiet hours end.
 */
async function processGmail(bot: Bot<Context>): Promise<void> {
    if (!isGmailEnabled()) return

    const chatId = getNotifyChatId()
    if (chatId === null) {
        logger.warn(
            "Gmail digest enabled but recipient is ambiguous — set GMAIL_NOTIFY_TELEGRAM_ID",
        )
        return
    }

    const now = Date.now()
    if (lastGmailCheck !== null && now - lastGmailCheck < GMAIL_INTERVAL_MS) {
        return
    }

    // Use the recipient's timezone/quiet hours when we know them, else defaults.
    const prisma = getPrisma()
    const user = await prisma.user.findUnique({
        where: { telegramUserId: BigInt(chatId) },
    })
    const timezone = user?.timezone ?? "Europe/Moscow"
    const quietFrom = user?.quietFrom ?? "22:00"
    const quietTo = user?.quietTo ?? "09:00"

    // Quiet hours: skip the whole check, do NOT advance the cursor or the timer.
    if (isTimeInQuietHours(new Date(), timezone, quietFrom, quietTo)) {
        return
    }

    lastGmailCheck = now

    try {
        const emails = await fetchNewEmails()
        if (emails.length === 0) {
            logger.info("Gmail check: no new emails")
            return
        }

        const text = formatDigest(emails, timezone)
        const chunks = splitMessage(text, TELEGRAM_MSG_LIMIT)
        for (const chunk of chunks) {
            await bot.api.sendMessage(chatId, chunk, { parse_mode: "HTML" })
        }

        // Advance cursor only after a successful send.
        const newestInternalDate = emails[emails.length - 1]!.internalDate
        await saveCursor(newestInternalDate)
        logger.info({ count: emails.length }, "Gmail digest sent")
    } catch (error) {
        logger.error({ err: error }, "Failed to send Gmail digest")
        await notifyError(error, "Gmail digest", chatId)
    }
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
            const upcoming = await taskService.getUpcoming(
                user.id,
                user.timezone,
            )

            if (
                overdue.length === 0 &&
                today.length === 0 &&
                inbox.length === 0 &&
                upcoming.length === 0
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

            if (upcoming.length > 0) {
                lines.push(`📅 <b>Upcoming: ${upcoming.length} task(s)</b>`)
                for (const t of upcoming) {
                    const dateStr = formatDate(t.dueAt, user.timezone)
                    lines.push(`  • ${t.title} — ${dateStr}`)
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
