import { getPrisma } from "../db/index.js"
import type { RepeatRule, RepeatUnit } from "@prisma/client"

export async function setRule(
    taskId: number,
    everyN: number,
    unit: RepeatUnit,
): Promise<RepeatRule> {
    const prisma = getPrisma()

    // Upsert: update existing or create new
    const existing = await prisma.repeatRule.findUnique({
        where: { taskId },
    })

    if (existing) {
        return prisma.repeatRule.update({
            where: { taskId },
            data: { everyN, unit, active: true },
        })
    }

    return prisma.repeatRule.create({
        data: { taskId, everyN, unit, active: true },
    })
}

export async function removeRule(taskId: number): Promise<void> {
    const prisma = getPrisma()
    const existing = await prisma.repeatRule.findUnique({
        where: { taskId },
    })

    if (existing) {
        await prisma.repeatRule.update({
            where: { taskId },
            data: { active: false },
        })
    }
}

export async function getRule(
    taskId: number,
): Promise<RepeatRule | null> {
    const prisma = getPrisma()
    return prisma.repeatRule.findUnique({
        where: { taskId },
    })
}
