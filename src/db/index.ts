import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import pg from "pg"
import { config } from "../config/index.js"

let prisma: PrismaClient

export function getPrisma(): PrismaClient {
    if (!prisma) {
        const pool = new pg.Pool({ connectionString: config.DATABASE_URL })
        const adapter = new PrismaPg(pool)
        prisma = new PrismaClient({ adapter })
    }
    return prisma
}

export { prisma }
