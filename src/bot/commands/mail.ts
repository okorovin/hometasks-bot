import type { Context } from "grammy"
import { getOrCreateUser } from "../../services/user.service.js"
import {
    isGmailEnabled,
    fetchRecentEmails,
    formatEmailList,
} from "../../services/gmail.service.js"
import { notifyError } from "../../utils/error-notifier.js"

const MANUAL_LIMIT = 10

/**
 * /mail — manually list the latest inbox emails. Read-only: does NOT advance the
 * hourly digest cursor, so it never affects what the next digest reports.
 */
export async function mailCommand(ctx: Context): Promise<void> {
    if (!ctx.from) return

    if (!isGmailEnabled()) {
        await ctx.reply("📭 Gmail is not configured.")
        return
    }

    const user = await getOrCreateUser(BigInt(ctx.from.id))

    try {
        await ctx.reply("📨 Fetching latest emails…")

        const emails = await fetchRecentEmails(MANUAL_LIMIT)
        if (emails.length === 0) {
            await ctx.reply("📭 Inbox is empty.")
            return
        }

        const plural = emails.length === 1 ? "" : "s"
        const header = `📨 <b>Last ${emails.length} email${plural}</b>`
        await ctx.reply(formatEmailList(emails, user.timezone, header), {
            parse_mode: "HTML",
        })
    } catch (error) {
        await notifyError(error, "manual mail fetch", ctx.from.id)
    }
}
