import type { FastifyInstance } from "fastify"
import fp from "fastify-plugin"
import fastifyStatic from "@fastify/static"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"
import { existsSync } from "fs"

const __dirname = dirname(fileURLToPath(import.meta.url))

async function staticFiles(app: FastifyInstance): Promise<void> {
    const webDist = resolve(__dirname, "../../../web/dist")

    if (!existsSync(webDist)) {
        return
    }

    await app.register(fastifyStatic, {
        root: webDist,
    })

    // SPA fallback: non-API routes that don't match a static file get index.html
    app.setNotFoundHandler((request, reply) => {
        if (request.url.startsWith("/api/")) {
            reply.status(404).send({ error: "Not found" })
        } else {
            reply.sendFile("index.html")
        }
    })
}

export const staticPlugin = fp(staticFiles)
