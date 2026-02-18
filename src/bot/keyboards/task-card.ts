import { InlineKeyboard } from "grammy"
import type { Task } from "@prisma/client"

export function taskCardKeyboard(task: Task): InlineKeyboard {
    const kb = new InlineKeyboard()
    kb.text("✅ Done", `done:${task.id}`)
    kb.text("⏰ Postpone", `postpone:${task.id}`)
    kb.row()
    kb.text("📅 Set due", `setdue:${task.id}`)
    kb.text("🔁 Repeat", `repeat:${task.id}`)
    kb.row()
    kb.text("✏️ Edit", `edit:${task.id}`)
    kb.text("🗑 Delete", `delete:${task.id}`)
    return kb
}

export function postponeKeyboard(taskId: number): InlineKeyboard {
    const kb = new InlineKeyboard()
    kb.text("15 min", `postpone_do:${taskId}:15`)
    kb.text("1 hour", `postpone_do:${taskId}:60`)
    kb.row()
    kb.text("Tomorrow", `postpone_do:${taskId}:tomorrow`)
    kb.text("← Back", `back:${taskId}`)
    return kb
}

export function repeatKeyboard(taskId: number): InlineKeyboard {
    const kb = new InlineKeyboard()
    kb.text("Every day", `repeat_set:${taskId}:1:DAY`)
    kb.text("Every week", `repeat_set:${taskId}:1:WEEK`)
    kb.row()
    kb.text("Every month", `repeat_set:${taskId}:1:MONTH`)
    kb.text("Remove repeat", `repeat_remove:${taskId}`)
    kb.row()
    kb.text("← Back", `back:${taskId}`)
    return kb
}

export function deleteConfirmKeyboard(taskId: number): InlineKeyboard {
    const kb = new InlineKeyboard()
    kb.text("Yes, delete", `confirm_delete:${taskId}`)
    kb.text("← Cancel", `back:${taskId}`)
    return kb
}

export function taskListItemKeyboard(taskId: number): InlineKeyboard {
    const kb = new InlineKeyboard()
    kb.text("Open", `open:${taskId}`)
    kb.text("✅ Done", `done:${taskId}`)
    return kb
}

export function setDueKeyboard(taskId: number): InlineKeyboard {
    const kb = new InlineKeyboard()
    kb.text("Today 09:00", `setdue_do:${taskId}:today_9`)
    kb.text("Today 18:00", `setdue_do:${taskId}:today_18`)
    kb.row()
    kb.text("Tomorrow 09:00", `setdue_do:${taskId}:tomorrow_9`)
    kb.text("Tomorrow 18:00", `setdue_do:${taskId}:tomorrow_18`)
    kb.row()
    kb.text("📝 Custom date", `setdue_custom:${taskId}`)
    kb.text("← Back", `back:${taskId}`)
    return kb
}
