import { serve } from "@hono/node-server"
import { createSandboxApp } from "./server.js"

const PORT = Number.parseInt(process.env.SANDBOX_SERVER_PORT ?? "3000", 10)

const app = createSandboxApp()

console.log(`[sandbox-server] starting on port ${PORT}`)

serve({ fetch: app.fetch, port: PORT }, (info) => {
	console.log(`[sandbox-server] listening on http://0.0.0.0:${info.port}`)
})
