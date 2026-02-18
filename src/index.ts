import { logger } from "./logger.js"
import { getPrisma } from "./db/index.js"
import { createBot } from "./bot/index.js"
import { setCommandsMenu } from "./bot/commands/index.js"
import { startScheduler, stopScheduler } from "./scheduler/index.js"

async function main(): Promise<void> {
    logger.info("Starting Home Tasks Bot...")

    // Test DB connection
    const prisma = getPrisma()
    await prisma.$connect()
    logger.info("Database connected")

    // Create and start bot
    const bot = createBot()
    logger.info("Bot created, starting long-polling...")

    // Start scheduler
    startScheduler(bot)

    // Graceful shutdown
    const shutdown = async (signal: string) => {
        logger.info(`Received ${signal}, shutting down...`)
        stopScheduler()
        bot.stop()
        await prisma.$disconnect()
        process.exit(0)
    }

    process.on("SIGINT", () => shutdown("SIGINT"))
    process.on("SIGTERM", () => shutdown("SIGTERM"))

    // Set commands menu (non-critical, don't crash if fails)
    try {
        await setCommandsMenu(bot)
        logger.info("Bot commands menu set")
    } catch (err) {
        logger.warn({ err }, "Failed to set commands menu")
    }

    // Start bot (this blocks)
    await bot.start({
        onStart: () => {
            logger.info("Bot is running!")
        },
    })
}

main().catch((err) => {
    logger.fatal({ err }, "Failed to start bot")
    process.exit(1)
})
