import { serve } from "@hono/node-server"
import { createLogger } from "@openzosma/logger"
import { createSandboxApp } from "./server.js"

const log = createLogger({ component: "sandbox-server" })
const PORT = Number.parseInt(process.env.SANDBOX_SERVER_PORT ?? "3000", 10)

const app = createSandboxApp()

log.info(`Starting on port ${PORT}`)

serve({ fetch: app.fetch, port: PORT }, (info) => {
	log.info(`Listening on http://0.0.0.0:${info.port}`)
})
