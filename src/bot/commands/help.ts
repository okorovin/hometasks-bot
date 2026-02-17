import type { Context } from "grammy"

export async function helpCommand(ctx: Context): Promise<void> {
    const text = [
        "🏠 <b>Home Tasks Bot</b>",
        "",
        "Just send me a message and I'll create a task from it!",
        "You can also forward messages to create tasks.",
        "",
        "<b>Commands:</b>",
        "/add <i>text</i> — Create a task",
        "/today — Tasks due today",
        "/inbox — Tasks without a due date",
        "/overdue — Overdue tasks",
        "/week — Tasks for the next 7 days",
        "/all — All active tasks",
        "/settings — Bot settings",
        "/help — This help message",
        "",
        "<b>Task card buttons:</b>",
        "✅ Done — Complete the task",
        "⏰ Postpone — Postpone by 15m/1h/tomorrow",
        "📅 Set due — Set a due date",
        "🔁 Repeat — Set up recurring task",
        "✏️ Edit — Change the title",
        "🗑 Delete — Delete the task",
    ].join("\n")

    await ctx.reply(text, { parse_mode: "HTML" })
}
