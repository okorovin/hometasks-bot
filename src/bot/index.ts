import { Bot } from "grammy"
import { config } from "../config/index.js"
import { logger } from "../logger.js"
import { authMiddleware } from "./middleware/auth.js"
import { registerCommands } from "./commands/index.js"
import { handleMessage } from "./handlers/message.js"
import { handleCallback } from "./handlers/callback.js"
import { setBot, notifyError } from "../utils/error-notifier.js"

export function createBot(): Bot {
    const bot = new Bot(config.BOT_TOKEN)
    setBot(bot)

    // Auth middleware — must be first
    bot.use(authMiddleware)

    // Register commands
    registerCommands(bot)

    // Handle callback queries (inline buttons)
    bot.on("callback_query:data", handleCallback)

    // Handle text messages (task creation)
    bot.on("message:text", handleMessage)

    // Error handler
    bot.catch((err) => {
        logger.error({ err: err.error }, "Bot error")
        const chatId = err.ctx?.chat?.id
        notifyError(err.error, "bot", chatId ? BigInt(chatId) : undefined)
    })

    return bot
}
