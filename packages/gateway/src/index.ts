import "dotenv/config"
import { serve } from "@hono/node-server"
import { createPool } from "@openzosma/db"
import { WebSocketServer } from "ws"
import { createApp } from "./app.js"
import { SessionManager } from "./session-manager.js"
import { handleWebSocket } from "./ws.js"

const PORT = Number(process.env.GATEWAY_PORT) || 4000
const HOST = process.env.GATEWAY_HOST || "0.0.0.0"
const SANDBOX_MODE = process.env.OPENZOSMA_SANDBOX_MODE || "local"

// Pool is optional in local mode: when DATABASE_URL / DB_* vars are not set
// (e.g. bare MVP dev without Postgres) the gateway still starts and A2A routes
// return empty skills. In orchestrator mode the pool is required.
const pool = (process.env.DATABASE_URL ?? process.env.DB_HOST) ? createPool() : undefined

async function createSessionManager(): Promise<SessionManager> {
	if (SANDBOX_MODE === "orchestrator") {
		if (!pool) {
			throw new Error(
				"OPENZOSMA_SANDBOX_MODE=orchestrator requires a database connection. " +
					"Set DATABASE_URL or DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASS.",
			)
		}

		const { SandboxManager, OrchestratorSessionManager, loadConfigFromEnv } = await import("@openzosma/orchestrator")
		const config = loadConfigFromEnv()
		const sandboxManager = new SandboxManager(pool, { config })
		const orchestrator = new OrchestratorSessionManager(pool, sandboxManager)

		console.log("Sandbox mode: orchestrator (per-user OpenShell sandboxes)")
		return new SessionManager({ pool, orchestrator })
	}

	console.log("Sandbox mode: local (in-process pi-agent)")
	return new SessionManager({ pool })
}

const sessionManager = await createSessionManager()
const app = createApp(sessionManager, pool)

const server = serve({ fetch: app.fetch, port: PORT, hostname: HOST }, () => {
	console.log(`Gateway listening on ${HOST}:${PORT}`)
})

// Attach WebSocket server using noServer mode
const wss = new WebSocketServer({ noServer: true })

server.on("upgrade", (request, socket, head) => {
	if (request.url === "/ws") {
		wss.handleUpgrade(request, socket, head, (ws) => {
			wss.emit("connection", ws, request)
		})
	} else {
		socket.destroy()
	}
})

wss.on("connection", (ws) => {
	handleWebSocket(ws, sessionManager)
})
