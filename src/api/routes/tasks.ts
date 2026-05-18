import type { FastifyInstance } from "fastify"
import * as taskService from "../../services/task.service.js"
import * as tagService from "../../services/tag.service.js"
import { getPrisma } from "../../db/index.js"

export async function taskRoutes(app: FastifyInstance): Promise<void> {
    app.addHook("onRequest", app.authenticate)

    // List tasks with optional filters
    app.get<{
        Querystring: { status?: string; tag?: string; search?: string }
    }>("/", async (request) => {
        const { userId } = request.user
        const { status, tag, search } = request.query
        const prisma = getPrisma()

        const where: Record<string, unknown> = { userId }

        if (status === "ACTIVE" || status === "DONE") {
            where.status = status
        } else {
            where.status = "ACTIVE"
        }

        if (search) {
            where.title = { contains: search, mode: "insensitive" }
        }

        if (tag) {
            const tagIds = await tagService.getTasksByTag(userId, tag)
            where.id = { in: tagIds }
        }

        const tasks = await prisma.task.findMany({
            where,
            orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
            include: {
                repeatRule: true,
                taskTags: { include: { tag: true } },
            },
        })

        return tasks.map(formatTaskResponse)
    })

    // Get single task
    app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
        const task = await taskService.getTaskById(parseInt(request.params.id, 10))
        if (!task || task.userId !== request.user.userId) {
            return reply.status(404).send({ error: "Task not found" })
        }
        return formatTaskResponse(task)
    })

    // Create task
    app.post<{
        Body: { title: string; notes?: string; dueAt?: string; tagIds?: number[] }
    }>("/", async (request) => {
        const { userId } = request.user
        const { title, notes, dueAt, tagIds } = request.body

        const task = await taskService.createTask({
            userId,
            title,
            notes: notes ?? null,
            dueAt: dueAt ? new Date(dueAt) : null,
        })

        if (tagIds && tagIds.length > 0) {
            await tagService.setTaskTags(task.id, tagIds)
        }

        const fullTask = await taskService.getTaskById(task.id)
        return formatTaskResponse(fullTask!)
    })

    // Update task
    app.patch<{
        Params: { id: string }
        Body: { title?: string; notes?: string; dueAt?: string | null }
    }>("/:id", async (request, reply) => {
        const taskId = parseInt(request.params.id, 10)
        const task = await taskService.getTaskById(taskId)
        if (!task || task.userId !== request.user.userId) {
            return reply.status(404).send({ error: "Task not found" })
        }

        const prisma = getPrisma()
        const data: Record<string, unknown> = {}
        if (request.body.title !== undefined) data.title = request.body.title
        if (request.body.notes !== undefined) data.notes = request.body.notes
        if (request.body.dueAt !== undefined) {
            data.dueAt = request.body.dueAt ? new Date(request.body.dueAt) : null
        }

        await prisma.task.update({ where: { id: taskId }, data })
        const updated = await taskService.getTaskById(taskId)
        return formatTaskResponse(updated!)
    })

    // Complete task
    app.post<{ Params: { id: string } }>("/:id/done", async (request, reply) => {
        const taskId = parseInt(request.params.id, 10)
        const task = await taskService.getTaskById(taskId)
        if (!task || task.userId !== request.user.userId) {
            return reply.status(404).send({ error: "Task not found" })
        }

        const result = await taskService.completeTask(taskId)
        return formatTaskResponse(result)
    })

    // Postpone task
    app.post<{
        Params: { id: string }
        Body: { minutes: number }
    }>("/:id/postpone", async (request, reply) => {
        const taskId = parseInt(request.params.id, 10)
        const task = await taskService.getTaskById(taskId)
        if (!task || task.userId !== request.user.userId) {
            return reply.status(404).send({ error: "Task not found" })
        }

        const result = await taskService.postponeTask(taskId, request.body.minutes)
        return formatTaskResponse(result)
    })

    // Delete task (soft)
    app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
        const taskId = parseInt(request.params.id, 10)
        const task = await taskService.getTaskById(taskId)
        if (!task || task.userId !== request.user.userId) {
            return reply.status(404).send({ error: "Task not found" })
        }

        await taskService.deleteTask(taskId)
        return { ok: true }
    })

    // Set tags on task
    app.post<{
        Params: { id: string }
        Body: { tagIds: number[] }
    }>("/:id/tags", async (request, reply) => {
        const taskId = parseInt(request.params.id, 10)
        const task = await taskService.getTaskById(taskId)
        if (!task || task.userId !== request.user.userId) {
            return reply.status(404).send({ error: "Task not found" })
        }

        await tagService.setTaskTags(taskId, request.body.tagIds)
        const updated = await taskService.getTaskById(taskId)
        return formatTaskResponse(updated!)
    })
}

function formatTaskResponse(task: Record<string, unknown>): Record<string, unknown> {
    const t = task as Record<string, unknown>
    const taskTags = (t.taskTags as Array<{ tag: { id: number; name: string; color: string | null } }>) ?? []
    return {
        id: t.id,
        title: t.title,
        notes: t.notes,
        status: t.status,
        dueAt: t.dueAt,
        createdAt: t.createdAt,
        doneAt: t.doneAt,
        sourceType: t.sourceType,
        repeatRule: t.repeatRule ?? null,
        tags: taskTags.map(tt => ({ id: tt.tag.id, name: tt.tag.name, color: tt.tag.color })),
    }
}
