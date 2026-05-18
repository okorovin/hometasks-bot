import Fastify from "fastify"
import fastifyCors from "@fastify/cors"
import { config } from "../config/index.js"
import { logger } from "../logger.js"
import { authPlugin } from "./plugins/auth.js"
import { staticPlugin } from "./plugins/static.js"
import { authRoutes } from "./routes/auth.js"
import { taskRoutes } from "./routes/tasks.js"
import { tagRoutes } from "./routes/tags.js"

export async function startApi(): Promise<void> {
    const app = Fastify({ logger: false })

    await app.register(fastifyCors, { origin: true })
    await app.register(authPlugin)
    await app.register(authRoutes, { prefix: "/api/auth" })
    await app.register(taskRoutes, { prefix: "/api/tasks" })
    await app.register(tagRoutes, { prefix: "/api/tags" })
    await app.register(staticPlugin)

    const address = await app.listen({ port: config.PORT, host: "0.0.0.0" })
    logger.info(`API server listening on ${address}`)
}
