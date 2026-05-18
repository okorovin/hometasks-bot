import type { FastifyInstance } from "fastify"
import { validateToken } from "../../services/auth.service.js"
import { getPrisma } from "../../db/index.js"

export async function authRoutes(app: FastifyInstance): Promise<void> {
    app.post<{ Body: { token: string } }>("/token", async (request, reply) => {
        const { token } = request.body ?? {}
        if (!token) {
            return reply.status(400).send({ error: "Token required" })
        }

        const userId = validateToken(token)
        if (userId === null) {
            return reply.status(401).send({ error: "Invalid or expired token" })
        }

        const jwt = app.jwt.sign({ userId }, { expiresIn: "7d" })
        return { token: jwt }
    })

    app.get("/me", { onRequest: [app.authenticate] }, async (request) => {
        const prisma = getPrisma()
        const user = await prisma.user.findUnique({
            where: { id: request.user.userId },
        })
        if (!user) throw new Error("User not found")
        return {
            id: user.id,
            timezone: user.timezone,
            digestTime: user.digestTime,
        }
    })
}
