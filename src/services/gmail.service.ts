import { google } from "googleapis"
import type { gmail_v1 } from "googleapis"
import { config } from "../config/index.js"
import { getPrisma } from "../db/index.js"
import { logger } from "../logger.js"

const GMAIL_STATE_ID = 1
const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"

// How far back to look each run. We over-fetch with a documented `newer_than`
// operator and then filter precisely by `internalDate`, so 2d comfortably
// covers the hourly cadence plus overnight quiet-hours gaps and short downtime.
const LOOKBACK_QUERY = "in:inbox newer_than:2d"

const MAX_DIGEST_EMAILS = 15
const SUBJECT_MAX = 120
const SNIPPET_MAX = 120

export interface EmailSummary {
    subject: string
    from: string
    internalDate: number // epoch ms
    snippet: string
}

/** Feature is enabled only when all three OAuth credentials are present. */
export function isGmailEnabled(): boolean {
    return Boolean(
        config.GMAIL_CLIENT_ID &&
            config.GMAIL_CLIENT_SECRET &&
            config.GMAIL_REFRESH_TOKEN,
    )
}

/**
 * Resolve the Telegram chat id that should receive the digest.
 * Explicit GMAIL_NOTIFY_TELEGRAM_ID wins; otherwise fall back to the single
 * allowed id. Returns null when the recipient is ambiguous.
 */
export function getNotifyChatId(): number | null {
    if (config.GMAIL_NOTIFY_TELEGRAM_ID) {
        return Number(config.GMAIL_NOTIFY_TELEGRAM_ID)
    }
    if (config.ALLOWED_TELEGRAM_IDS.length === 1) {
        return Number(config.ALLOWED_TELEGRAM_IDS[0])
    }
    return null
}

function getGmailClient(): gmail_v1.Gmail {
    const oauth2 = new google.auth.OAuth2(
        config.GMAIL_CLIENT_ID,
        config.GMAIL_CLIENT_SECRET,
    )
    oauth2.setCredentials({ refresh_token: config.GMAIL_REFRESH_TOKEN })
    return google.gmail({ version: "v1", auth: oauth2 })
}

function getHeader(
    headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
    name: string,
): string | undefined {
    const lower = name.toLowerCase()
    return headers?.find((h) => h.name?.toLowerCase() === lower)?.value ?? undefined
}

/**
 * Fetch inbox emails newer than the stored cursor.
 * On the very first run (no cursor row) it initialises the cursor to "now" and
 * returns [] so we don't dump the whole inbox. The caller advances the cursor
 * via saveCursor() only after a successful send.
 */
export async function fetchNewEmails(): Promise<EmailSummary[]> {
    const prisma = getPrisma()

    const state = await prisma.gmailState.findUnique({
        where: { id: GMAIL_STATE_ID },
    })

    if (!state) {
        await prisma.gmailState.create({
            data: { id: GMAIL_STATE_ID, lastInternalDate: BigInt(Date.now()) },
        })
        logger.info("Gmail cursor initialised; first digest starts next run")
        return []
    }

    const cursorMs = Number(state.lastInternalDate)
    const gmail = getGmailClient()

    const list = await gmail.users.messages.list({
        userId: "me",
        q: LOOKBACK_QUERY,
        maxResults: 100,
    })

    const ids = (list.data.messages ?? [])
        .map((m) => m.id)
        .filter((id): id is string => Boolean(id))

    const emails: EmailSummary[] = []
    for (const id of ids) {
        const msg = await gmail.users.messages.get({
            userId: "me",
            id,
            format: "metadata",
            metadataHeaders: ["Subject", "From", "Date"],
        })

        const internalDate = Number(msg.data.internalDate ?? 0)
        if (internalDate <= cursorMs) continue // boundary-second dedupe

        const headers = msg.data.payload?.headers
        emails.push({
            subject: getHeader(headers, "Subject") ?? "(no subject)",
            from: getHeader(headers, "From") ?? "(unknown sender)",
            internalDate,
            snippet: msg.data.snippet ?? "",
        })
    }

    emails.sort((a, b) => a.internalDate - b.internalDate)
    return emails
}

/** Persist the cursor. Call only after the digest was delivered successfully. */
export async function saveCursor(internalDateMs: number): Promise<void> {
    const prisma = getPrisma()
    await prisma.gmailState.upsert({
        where: { id: GMAIL_STATE_ID },
        update: { lastInternalDate: BigInt(internalDateMs) },
        create: { id: GMAIL_STATE_ID, lastInternalDate: BigInt(internalDateMs) },
    })
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
}

function truncate(text: string, max: number): string {
    const trimmed = text.trim()
    return trimmed.length > max ? trimmed.slice(0, max - 1) + "…" : trimmed
}

/** Extract a human sender name from a `From` header, falling back to the address. */
function parseSenderName(from: string): string {
    const match = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/)
    if (match) {
        const name = match[1]?.trim()
        return name && name.length > 0 ? name : match[2]!.trim()
    }
    return from.trim()
}

export function formatDigest(emails: EmailSummary[], timezone: string): string {
    const shown = emails.slice(0, MAX_DIGEST_EMAILS)
    const plural = emails.length === 1 ? "" : "s"
    const lines: string[] = [`📬 <b>${emails.length} new email${plural}</b>\n`]

    shown.forEach((email, index) => {
        const time = new Date(email.internalDate).toLocaleTimeString("en-GB", {
            timeZone: timezone,
            hour: "2-digit",
            minute: "2-digit",
        })
        const sender = parseSenderName(email.from)
        lines.push(
            `${index + 1}. <b>${escapeHtml(truncate(email.subject, SUBJECT_MAX))}</b>`,
        )
        lines.push(`   from ${escapeHtml(sender)} — ${time}`)
        if (email.snippet) {
            lines.push(`   ${escapeHtml(truncate(email.snippet, SNIPPET_MAX))}`)
        }
        lines.push("")
    })

    if (emails.length > MAX_DIGEST_EMAILS) {
        lines.push(`…and ${emails.length - MAX_DIGEST_EMAILS} more`)
    }

    return lines.join("\n").trimEnd()
}

export { GMAIL_READONLY_SCOPE }
