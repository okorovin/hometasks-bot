import { getPrisma } from "../db/index.js"
import type { Task, SourceType } from "@prisma/client"
import {
    startOfDayInTz,
    endOfDayInTz,
    addInterval,
} from "../utils/date.js"
import * as reminderService from "./reminder.service.js"

export interface CreateTaskInput {
    userId: number
    title: string
    notes?: string | null
    dueAt?: Date | null
    sourceType?: SourceType
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
    const prisma = getPrisma()
    const task = await prisma.task.create({
        data: {
            userId: input.userId,
            title: input.title,
            notes: input.notes ?? null,
            dueAt: input.dueAt ?? null,
            sourceType: input.sourceType ?? "TEXT",
        },
    })

    // Create reminder if dueAt is set
    if (task.dueAt) {
        await reminderService.createForTask(task.id, task.dueAt)
    }

    return task
}

export async function getTaskById(taskId: number): Promise<Task | null> {
    const prisma = getPrisma()
    return prisma.task.findUnique({
        where: { id: taskId },
        include: { repeatRule: true },
    })
}

export async function completeTask(taskId: number): Promise<Task> {
    const prisma = getPrisma()
    const now = new Date()

    const task = await prisma.task.update({
        where: { id: taskId },
        data: {
            status: "DONE",
            doneAt: now,
        },
        include: { repeatRule: true },
    })

    // Cancel pending reminders
    await reminderService.cancelForTask(taskId)

    // Handle repeat rule — create next instance
    if (task.repeatRule && task.repeatRule.active) {
        const nextDueAt = addInterval(
            now,
            task.repeatRule.everyN,
            task.repeatRule.unit,
        )
        const newTask = await prisma.task.create({
            data: {
                userId: task.userId,
                title: task.title,
                notes: task.notes,
                dueAt: nextDueAt,
                sourceType: task.sourceType,
            },
        })

        // Copy repeat rule to new task
        await prisma.repeatRule.create({
            data: {
                taskId: newTask.id,
                everyN: task.repeatRule.everyN,
                unit: task.repeatRule.unit,
                active: true,
            },
        })

        // Create reminder for new task
        await reminderService.createForTask(newTask.id, nextDueAt)

        return newTask
    }

    return task
}

export async function deleteTask(taskId: number): Promise<Task> {
    const prisma = getPrisma()
    await reminderService.cancelForTask(taskId)
    return prisma.task.update({
        where: { id: taskId },
        data: { status: "DELETED" },
    })
}

export async function postponeTask(
    taskId: number,
    minutes: number,
): Promise<Task> {
    const prisma = getPrisma()
    const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } })

    const base = task.dueAt ?? new Date()
    const newDueAt = new Date(base.getTime() + minutes * 60 * 1000)

    await reminderService.cancelForTask(taskId)
    await reminderService.createForTask(taskId, newDueAt)

    return prisma.task.update({
        where: { id: taskId },
        data: { dueAt: newDueAt },
    })
}

export async function setDueDate(
    taskId: number,
    dueAt: Date,
): Promise<Task> {
    const prisma = getPrisma()
    await reminderService.cancelForTask(taskId)
    await reminderService.createForTask(taskId, dueAt)

    return prisma.task.update({
        where: { id: taskId },
        data: { dueAt },
    })
}

export async function updateTitle(
    taskId: number,
    newTitle: string,
): Promise<Task> {
    const prisma = getPrisma()
    return prisma.task.update({
        where: { id: taskId },
        data: { title: newTitle },
    })
}

export async function updateCardMessageId(
    taskId: number,
    cardMessageId: number,
): Promise<void> {
    const prisma = getPrisma()
    await prisma.task.update({
        where: { id: taskId },
        data: { cardMessageId },
    })
}

export async function getToday(
    userId: number,
    timezone: string,
): Promise<Task[]> {
    const prisma = getPrisma()
    const start = startOfDayInTz(timezone)
    const end = endOfDayInTz(timezone)

    return prisma.task.findMany({
        where: {
            userId,
            status: "ACTIVE",
            dueAt: { gte: start, lte: end },
        },
        orderBy: { dueAt: "asc" },
        include: { repeatRule: true },
    })
}

export async function getInbox(userId: number): Promise<Task[]> {
    const prisma = getPrisma()
    return prisma.task.findMany({
        where: {
            userId,
            status: "ACTIVE",
            dueAt: null,
        },
        orderBy: { createdAt: "desc" },
        include: { repeatRule: true },
    })
}

export async function getOverdue(
    userId: number,
    timezone: string,
): Promise<Task[]> {
    const prisma = getPrisma()
    const start = startOfDayInTz(timezone)

    return prisma.task.findMany({
        where: {
            userId,
            status: "ACTIVE",
            dueAt: { lt: start },
        },
        orderBy: { dueAt: "asc" },
        include: { repeatRule: true },
    })
}

export async function getWeek(
    userId: number,
    timezone: string,
): Promise<Task[]> {
    const prisma = getPrisma()
    const start = startOfDayInTz(timezone)
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000)

    return prisma.task.findMany({
        where: {
            userId,
            status: "ACTIVE",
            dueAt: { gte: start, lt: end },
        },
        orderBy: { dueAt: "asc" },
        include: { repeatRule: true },
    })
}

export async function getAll(userId: number): Promise<Task[]> {
    const prisma = getPrisma()
    return prisma.task.findMany({
        where: {
            userId,
            status: "ACTIVE",
        },
        orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
        include: { repeatRule: true },
    })
}
