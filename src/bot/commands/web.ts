import type { Context } from "grammy"
import { getOrCreateUser } from "../../services/user.service.js"
import { generateToken } from "../../services/auth.service.js"
import { config } from "../../config/index.js"

export async function webCommand(ctx: Context): Promise<void> {
    if (!ctx.from) return

    const user = await getOrCreateUser(BigInt(ctx.from.id))
    const token = generateToken(user.id)
    const url = `${config.WEB_URL}/login?token=${token}`

    await ctx.reply(
        `🌐 Open the web interface:\n\n${url}\n\n⏱ Link expires in 5 minutes.`,
        { link_preview_options: { is_disabled: true } },
    )
}
