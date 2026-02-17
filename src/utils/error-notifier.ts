import type { Bot, Context } from "grammy"
import { config } from "../config/index.js"
import { logger } from "../logger.js"

interface ErrorEntry {
    message: string
    count: number
    lastSent: number
}

const DEDUP_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes
const errorCache = new Map<string, ErrorEntry>()

let botInstance: Bot<Context> | null = null

export function setBot(bot: Bot<Context>): void {
    botInstance = bot
}

export async function notifyError(
    error: unknown,
    context: string,
    chatId?: bigint | number,
): Promise<void> {
    const errMsg =
        error instanceof Error ? error.message : String(error)
    const key = `${context}:${errMsg}`

    logger.error({ err: error, context }, `Error in ${context}`)

    const now = Date.now()
    const cached = errorCache.get(key)

    if (cached && now - cached.lastSent < DEDUP_INTERVAL_MS) {
        cached.count++
        return
    }

    const countSuffix = cached && cached.count > 0 ? ` (×${cached.count + 1})` : ""
    const text = `❌ Error in ${context}${countSuffix}:\n${errMsg}`

    errorCache.set(key, { message: errMsg, count: 0, lastSent: now })

    if (!botInstance) return

    try {
        if (chatId) {
            await botInstance.api.sendMessage(Number(chatId), text)
        } else {
            // Send to all allowed users
            for (const id of config.ALLOWED_TELEGRAM_IDS) {
                await botInstance.api.sendMessage(Number(id), text)
            }
        }
    } catch (sendErr) {
        logger.error({ err: sendErr }, "Failed to send error notification")
    }
}
