/**
 * Read-only smoke test for the Gmail integration.
 *
 * Verifies that GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN are
 * valid and that the gmail.readonly scope works, by printing the latest inbox
 * subjects. Does not touch the database or the cursor.
 *
 * Run:  npm run gmail:test
 */
import "dotenv/config"
import { google } from "googleapis"
import { isGmailEnabled, getNotifyChatId } from "../services/gmail.service.js"
import { config } from "../config/index.js"

const PREVIEW_COUNT = 5

async function main(): Promise<void> {
    if (!isGmailEnabled()) {
        console.error(
            "Gmail is not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET and GMAIL_REFRESH_TOKEN.",
        )
        process.exit(1)
    }

    const chatId = getNotifyChatId()
    console.log(
        chatId === null
            ? "⚠️  Recipient ambiguous — set GMAIL_NOTIFY_TELEGRAM_ID (multiple allowed ids).\n"
            : `Digest recipient chat id: ${chatId}\n`,
    )

    const oauth2 = new google.auth.OAuth2(
        config.GMAIL_CLIENT_ID,
        config.GMAIL_CLIENT_SECRET,
    )
    oauth2.setCredentials({ refresh_token: config.GMAIL_REFRESH_TOKEN })
    const gmail = google.gmail({ version: "v1", auth: oauth2 })

    const profile = await gmail.users.getProfile({ userId: "me" })
    console.log(`Connected as: ${profile.data.emailAddress}`)
    console.log(`Total messages in mailbox: ${profile.data.messagesTotal}\n`)

    const list = await gmail.users.messages.list({
        userId: "me",
        q: "in:inbox",
        maxResults: PREVIEW_COUNT,
    })
    const ids = (list.data.messages ?? []).map((m) => m.id).filter(Boolean)

    console.log(`Latest ${ids.length} inbox message(s):`)
    for (const id of ids) {
        const msg = await gmail.users.messages.get({
            userId: "me",
            id: id!,
            format: "metadata",
            metadataHeaders: ["Subject", "From"],
        })
        const headers = msg.data.payload?.headers ?? []
        const subject =
            headers.find((h) => h.name?.toLowerCase() === "subject")?.value ??
            "(no subject)"
        const from =
            headers.find((h) => h.name?.toLowerCase() === "from")?.value ??
            "(unknown)"
        console.log(`  • ${subject}  —  ${from}`)
    }

    console.log("\n✅ Gmail access works.")
    process.exit(0)
}

main().catch((err) => {
    console.error("\n❌ Gmail test failed:")
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
})
