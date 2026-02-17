import type { Context, NextFunction } from "grammy"
import { config } from "../../config/index.js"
import { logger } from "../../logger.js"

export async function authMiddleware(
    ctx: Context,
    next: NextFunction,
): Promise<void> {
    const userId = ctx.from?.id
    if (!userId) return

    const allowed = config.ALLOWED_TELEGRAM_IDS.some(
        (id) => id === BigInt(userId),
    )

    if (!allowed) {
        logger.warn({ userId }, "Unauthorized access attempt")
        return
    }

    await next()
}
