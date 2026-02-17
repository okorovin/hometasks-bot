import OpenAI from "openai"
import { config } from "../config/index.js"
import { logger } from "../logger.js"

const client = new OpenAI({
    baseURL: config.LLM_BASE_URL,
    apiKey: config.LLM_API_KEY,
})

export interface ParsedTask {
    title: string
    dueAt: string | null // ISO string or relative like "tomorrow", "in 2 hours"
    notes: string | null
}

const SYSTEM_PROMPT = `You are a task parser. Extract structured task information from user messages.

Current date and time: {{CURRENT_DATETIME}}
User timezone: {{TIMEZONE}}

Return a JSON object with these fields:
- "title": concise task title (string, max 100 chars)
- "due_at": deadline if mentioned (ISO 8601 datetime string in user's timezone, or null if not mentioned)
- "notes": additional details if any (string or null)

Rules for due_at:
- If a specific date is mentioned (e.g., "завтра", "в пятницу", "15 марта"), calculate the actual date
- If only date without time, set time to 09:00
- If relative time (e.g., "через 2 часа", "через 30 минут"), calculate from current time
- If no deadline mentioned, set to null
- Always return datetime in ISO 8601 format with timezone offset

Rules for title:
- Keep it concise and actionable
- If the original text is already short (< 100 chars), use it as-is
- Remove filler words but keep the meaning

Respond ONLY with valid JSON, no markdown, no explanation.`

const FORWARD_SYSTEM_PROMPT = `You are a task parser. A user forwarded a message and wants to create a task from it.

Current date and time: {{CURRENT_DATETIME}}
User timezone: {{TIMEZONE}}

The forwarded message text will be provided. Create a concise task from it.

Return a JSON object with these fields:
- "title": short, actionable task title extracted from the message (max 100 chars)
- "due_at": deadline if mentioned in the text (ISO 8601 datetime string, or null)
- "notes": null (the original forwarded text is already saved separately)

Rules:
- The title should capture the main action or request from the forwarded message
- If the message is a request or instruction, phrase the title as a task
- If the message is informational, phrase it as "Check: ..." or "Review: ..."
- Keep title concise — this is a summary, not the full text

Respond ONLY with valid JSON, no markdown, no explanation.`

function buildPrompt(template: string, timezone: string): string {
    const now = new Date().toLocaleString("ru-RU", {
        timeZone: timezone,
        dateStyle: "full",
        timeStyle: "short",
    })
    return template
        .replace("{{CURRENT_DATETIME}}", now)
        .replace("{{TIMEZONE}}", timezone)
}

export async function parseTaskFromText(
    text: string,
    timezone: string,
): Promise<ParsedTask> {
    try {
        const response = await client.chat.completions.create({
            model: config.LLM_MODEL,
            messages: [
                {
                    role: "system",
                    content: buildPrompt(SYSTEM_PROMPT, timezone),
                },
                { role: "user", content: text },
            ],
            temperature: 0.1,
            max_tokens: 500,
        })

        const content = response.choices[0]?.message?.content?.trim()
        if (!content) throw new Error("Empty LLM response")

        const raw = JSON.parse(content) as Record<string, unknown>
        return {
            title: (raw.title as string) || text.slice(0, 100),
            dueAt: (raw.due_at as string) ?? null,
            notes: (raw.notes as string) ?? null,
        }
    } catch (error) {
        logger.warn({ err: error }, "LLM parse failed, using fallback")
        return {
            title: text.slice(0, 100),
            dueAt: null,
            notes: null,
        }
    }
}

export async function parseTaskFromForward(
    forwardedText: string,
    timezone: string,
): Promise<ParsedTask> {
    try {
        const response = await client.chat.completions.create({
            model: config.LLM_MODEL,
            messages: [
                {
                    role: "system",
                    content: buildPrompt(FORWARD_SYSTEM_PROMPT, timezone),
                },
                { role: "user", content: forwardedText },
            ],
            temperature: 0.1,
            max_tokens: 500,
        })

        const content = response.choices[0]?.message?.content?.trim()
        if (!content) throw new Error("Empty LLM response")

        const raw = JSON.parse(content) as Record<string, unknown>
        return {
            title: (raw.title as string) || forwardedText.slice(0, 100),
            dueAt: (raw.due_at as string) ?? null,
            notes: null,
        }
    } catch (error) {
        logger.warn({ err: error }, "LLM forward parse failed, using fallback")
        return {
            title: forwardedText.slice(0, 100),
            dueAt: null,
            notes: null,
        }
    }
}
