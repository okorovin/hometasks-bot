import type { Context } from "grammy"
import { InlineKeyboard } from "grammy"
import { getOrCreateUser, updateUserSettings } from "../../services/user.service.js"

export async function settingsCommand(ctx: Context): Promise<void> {
    if (!ctx.from) return

    const user = await getOrCreateUser(BigInt(ctx.from.id))

    const text = [
        "⚙️ <b>Settings</b>",
        "",
        `🌍 Timezone: <code>${user.timezone}</code>`,
        `🌙 Quiet hours: <code>${user.quietFrom}</code> — <code>${user.quietTo}</code>`,
        `📬 Digest time: <code>${user.digestTime}</code>`,
    ].join("\n")

    const kb = new InlineKeyboard()
    kb.text("🌍 Change timezone", `settings:timezone`)
    kb.row()
    kb.text("🌙 Change quiet hours", `settings:quiet`)
    kb.row()
    kb.text("📬 Change digest time", `settings:digest`)

    await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb })
}
