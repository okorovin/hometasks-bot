import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify"
import fp from "fastify-plugin"
import fastifyJwt from "@fastify/jwt"
import { config } from "../../config/index.js"

declare module "@fastify/jwt" {
    interface FastifyJWT {
        payload: { userId: number }
        user: { userId: number }
    }
}

async function auth(app: FastifyInstance): Promise<void> {
    await app.register(fastifyJwt, { secret: config.JWT_SECRET })

    app.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            await request.jwtVerify()
        } catch {
            reply.status(401).send({ error: "Unauthorized" })
        }
    })
}

export const authPlugin = fp(auth)

declare module "fastify" {
    interface FastifyInstance {
        authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    }
}
