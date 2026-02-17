import { getPrisma } from "../db/index.js"
import type { Reminder } from "@prisma/client"

export async function createForTask(
    taskId: number,
    remindAt: Date,
): Promise<Reminder> {
    const prisma = getPrisma()
    return prisma.reminder.create({
        data: {
            taskId,
            remindAt,
            state: "SCHEDULED",
        },
    })
}

export async function cancelForTask(taskId: number): Promise<void> {
    const prisma = getPrisma()
    await prisma.reminder.updateMany({
        where: {
            taskId,
            state: "SCHEDULED",
        },
        data: { state: "CANCELLED" },
    })
}

export async function getDueReminders(): Promise<
    (Reminder & { task: { id: number; title: string; userId: number; user: { telegramUserId: bigint; timezone: string; quietFrom: string; quietTo: string } } })[]
> {
    const prisma = getPrisma()
    return prisma.reminder.findMany({
        where: {
            state: "SCHEDULED",
            remindAt: { lte: new Date() },
        },
        include: {
            task: {
                include: {
                    user: true,
                },
            },
        },
    }) as any
}

export async function markSent(reminderId: number): Promise<void> {
    const prisma = getPrisma()
    await prisma.reminder.update({
        where: { id: reminderId },
        data: { state: "SENT" },
    })
}
