import type { FastifyInstance } from "fastify"
import * as tagService from "../../services/tag.service.js"

export async function tagRoutes(app: FastifyInstance): Promise<void> {
    app.addHook("onRequest", app.authenticate)

    // List all user tags
    app.get("/", async (request) => {
        const tags = await tagService.getUserTags(request.user.userId)
        return tags.map(t => ({
            id: t.id,
            name: t.name,
            color: t.color,
            taskCount: t._count.taskTags,
        }))
    })

    // Create tag
    app.post<{ Body: { name: string; color?: string } }>("/", async (request) => {
        const tag = await tagService.createTag(
            request.user.userId,
            request.body.name,
            request.body.color,
        )
        return tag
    })

    // Update tag
    app.patch<{
        Params: { id: string }
        Body: { name?: string; color?: string | null }
    }>("/:id", async (request, reply) => {
        const tagId = parseInt(request.params.id, 10)
        const tag = await tagService.getTagById(tagId)
        if (!tag || tag.userId !== request.user.userId) {
            return reply.status(404).send({ error: "Tag not found" })
        }
        const updated = await tagService.updateTag(tagId, request.body)
        return updated
    })

    // Delete tag
    app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
        const tagId = parseInt(request.params.id, 10)
        const tag = await tagService.getTagById(tagId)
        if (!tag || tag.userId !== request.user.userId) {
            return reply.status(404).send({ error: "Tag not found" })
        }
        await tagService.deleteTag(tagId)
        return { ok: true }
    })
}
