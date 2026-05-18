import { getPrisma } from "../db/index.js"
import type { Tag } from "@prisma/client"

export async function createTag(userId: number, name: string, color?: string): Promise<Tag> {
    const prisma = getPrisma()
    return prisma.tag.upsert({
        where: { userId_name: { userId, name: name.toLowerCase().trim() } },
        update: {},
        create: { userId, name: name.toLowerCase().trim(), color: color ?? null },
    })
}

export async function getUserTags(userId: number): Promise<(Tag & { _count: { taskTags: number } })[]> {
    const prisma = getPrisma()
    return prisma.tag.findMany({
        where: { userId },
        include: { _count: { select: { taskTags: true } } },
        orderBy: { name: "asc" },
    })
}

export async function getTagById(tagId: number): Promise<Tag | null> {
    const prisma = getPrisma()
    return prisma.tag.findUnique({ where: { id: tagId } })
}

export async function updateTag(tagId: number, data: { name?: string; color?: string | null }): Promise<Tag> {
    const prisma = getPrisma()
    const updateData: { name?: string; color?: string | null } = {}
    if (data.name !== undefined) updateData.name = data.name.toLowerCase().trim()
    if (data.color !== undefined) updateData.color = data.color
    return prisma.tag.update({ where: { id: tagId }, data: updateData })
}

export async function deleteTag(tagId: number): Promise<void> {
    const prisma = getPrisma()
    await prisma.tag.delete({ where: { id: tagId } })
}

export async function setTaskTags(taskId: number, tagIds: number[]): Promise<void> {
    const prisma = getPrisma()
    await prisma.taskTag.deleteMany({ where: { taskId } })
    if (tagIds.length > 0) {
        await prisma.taskTag.createMany({
            data: tagIds.map(tagId => ({ taskId, tagId })),
        })
    }
}

export async function addTagToTask(taskId: number, tagId: number): Promise<void> {
    const prisma = getPrisma()
    await prisma.taskTag.upsert({
        where: { taskId_tagId: { taskId, tagId } },
        update: {},
        create: { taskId, tagId },
    })
}

export async function removeTagFromTask(taskId: number, tagId: number): Promise<void> {
    const prisma = getPrisma()
    await prisma.taskTag.deleteMany({ where: { taskId, tagId } })
}

export async function getTasksByTag(userId: number, tagName: string): Promise<number[]> {
    const prisma = getPrisma()
    const tag = await prisma.tag.findUnique({
        where: { userId_name: { userId, name: tagName.toLowerCase().trim() } },
        include: { taskTags: { select: { taskId: true } } },
    })
    if (!tag) return []
    return tag.taskTags.map(tt => tt.taskId)
}

export async function getTagsForTask(taskId: number): Promise<Tag[]> {
    const prisma = getPrisma()
    const taskTags = await prisma.taskTag.findMany({
        where: { taskId },
        include: { tag: true },
    })
    return taskTags.map(tt => tt.tag)
}

export async function ensureTags(userId: number, tagNames: string[]): Promise<Tag[]> {
    const tags: Tag[] = []
    for (const name of tagNames) {
        const tag = await createTag(userId, name)
        tags.push(tag)
    }
    return tags
}
