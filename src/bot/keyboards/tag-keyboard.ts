import { InlineKeyboard } from "grammy"
import type { Tag } from "@prisma/client"

export function tagSelectionKeyboard(
    taskId: number,
    allTags: Tag[],
    activeTagIds: Set<number>,
): InlineKeyboard {
    const kb = new InlineKeyboard()

    for (let i = 0; i < allTags.length; i++) {
        const tag = allTags[i]!
        const isActive = activeTagIds.has(tag.id)
        const prefix = isActive ? "✅ " : ""
        const action = isActive ? "tag_remove" : "tag_add"
        kb.text(`${prefix}${tag.name}`, `${action}:${taskId}:${tag.id}`)
        if (i % 2 === 1) kb.row()
    }
    if (allTags.length % 2 === 1) kb.row()

    kb.text("➕ New tag", `tag_new:${taskId}`)
    kb.text("← Back", `back:${taskId}`)

    return kb
}
