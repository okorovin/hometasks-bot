import type { Context } from "grammy"
import { getOrCreateUser } from "../../services/user.service.js"
import * as taskService from "../../services/task.service.js"
import * as llmService from "../../services/llm.service.js"
import { formatTaskCard } from "../formatters/task.js"
import { taskCardKeyboard } from "../keyboards/task-card.js"
import { notifyError } from "../../utils/error-notifier.js"
import { logger } from "../../logger.js"
import { config } from "../../config/index.js"

const MAX_VOICE_DURATION_SECONDS = 300

export async function handleVoice(ctx: Context): Promise<void> {
    const voice = ctx.message?.voice
    if (!voice || !ctx.from) return

    const telegramUserId = BigInt(ctx.from.id)

    if (voice.duration > MAX_VOICE_DURATION_SECONDS) {
        await ctx.reply("⚠️ Voice message too long (max 5 min). Please send a shorter one.")
        return
    }

    try {
        await ctx.reply("🎤 Transcribing voice message...")

        const file = await ctx.getFile()
        const fileUrl = `https://api.telegram.org/file/bot${config.BOT_TOKEN}/${file.file_path}`

        const response = await fetch(fileUrl)
        if (!response.ok) {
            throw new Error(`Failed to download voice file: ${response.status} ${response.statusText}`)
        }

        const arrayBuffer = await response.arrayBuffer()
        const audioBuffer = new Uint8Array(arrayBuffer)

        const transcript = await llmService.transcribeAudio(
            audioBuffer,
            `voice_${voice.file_unique_id}.ogg`,
        )

        const user = await getOrCreateUser(telegramUserId)
        const parsed = await llmService.parseTaskFromText(transcript, user.timezone)

        let dueAt: Date | null = null
        if (parsed.dueAt) {
            const parsedDate = new Date(parsed.dueAt)
            if (!isNaN(parsedDate.getTime())) {
                dueAt = parsedDate
            }
        }

        const task = await taskService.createTask({
            userId: user.id,
            title: parsed.title,
            notes: transcript,
            dueAt,
            sourceType: "VOICE",
        })

        const fullTask = await taskService.getTaskById(task.id)
        if (!fullTask) return

        const cardText = formatTaskCard(fullTask, user.timezone)
        const msg = await ctx.reply(cardText, {
            parse_mode: "HTML",
            reply_markup: taskCardKeyboard(fullTask),
        })

        await taskService.updateCardMessageId(task.id, msg.message_id)
    } catch (error) {
        logger.error({ err: error }, "Failed to create task from voice message")
        await notifyError(error, "voice transcription", telegramUserId)
    }
}
