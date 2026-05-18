import type { Task, RepeatRule, Tag, TaskTag } from "@prisma/client"
import { formatDatetime } from "../../utils/date.js"

type TaskWithRepeat = Task & {
    repeatRule?: RepeatRule | null
    taskTags?: (TaskTag & { tag: Tag })[]
}

function formatRepeatUnit(unit: string, n: number): string {
    switch (unit) {
        case "DAY":
            return n === 1 ? "every day" : `every ${n} days`
        case "WEEK":
            return n === 1 ? "every week" : `every ${n} weeks`
        case "MONTH":
            return n === 1 ? "every month" : `every ${n} months`
        default:
            return "no"
    }
}

export function formatTaskCard(
    task: TaskWithRepeat,
    timezone: string,
): string {
    const lines: string[] = []

    lines.push(`📌 <b>${escapeHtml(task.title)}</b>`)
    lines.push(
        `📅 Due: ${task.dueAt ? formatDatetime(task.dueAt, timezone) : "—"}`,
    )

    const repeat =
        task.repeatRule && task.repeatRule.active
            ? formatRepeatUnit(task.repeatRule.unit, task.repeatRule.everyN)
            : "no"
    lines.push(`🔁 Repeat: ${repeat}`)

    const tagNames = task.taskTags?.map(tt => tt.tag.name) ?? []
    const tagsStr = tagNames.length > 0 ? tagNames.join(", ") : "—"
    lines.push(`🏷 Tags: ${tagsStr}`)

    if (task.notes) {
        const truncated =
            task.notes.length > 200
                ? task.notes.slice(0, 200) + "..."
                : task.notes
        lines.push(`\n📝 ${escapeHtml(truncated)}`)
    }

    return lines.join("\n")
}

export function formatTaskListItem(
    task: TaskWithRepeat,
    timezone: string,
    index: number,
): string {
    const due = task.dueAt ? formatDatetime(task.dueAt, timezone) : "Inbox"
    return `${index + 1}. <b>${escapeHtml(task.title)}</b> — ${due}`
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
}
