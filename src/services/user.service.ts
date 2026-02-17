import { getPrisma } from "../db/index.js"
import type { User } from "@prisma/client"

export async function getOrCreateUser(telegramUserId: bigint): Promise<User> {
    const prisma = getPrisma()
    let user = await prisma.user.findUnique({
        where: { telegramUserId },
    })

    if (!user) {
        user = await prisma.user.create({
            data: { telegramUserId },
        })
    }

    return user
}

export async function getUserByTelegramId(
    telegramUserId: bigint,
): Promise<User | null> {
    const prisma = getPrisma()
    return prisma.user.findUnique({
        where: { telegramUserId },
    })
}

export async function updateUserSettings(
    userId: number,
    data: {
        timezone?: string
        quietFrom?: string
        quietTo?: string
        digestTime?: string
    },
): Promise<User> {
    const prisma = getPrisma()
    return prisma.user.update({
        where: { id: userId },
        data,
    })
}
