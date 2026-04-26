#!/usr/bin/env node
/**
 * Pi-Harness: Standalone headless pi-coding-agent server.
 *
 * Usage:
 *   node dist/index.js
 *   PI_HARNESS_PORT=9000 node dist/index.js
 *   PI_HARNESS_API_KEY=secret node dist/index.js
 *
 * Environment variables: see src/config.ts
 */
import { serve } from "@hono/node-server"
import { createLogger } from "@openzosma/logger"
import { loadConfig } from "./config.js"
import { createHarnessApp } from "./server.js"

const log = createLogger({ component: "pi-harness" })

function main() {
	const config = loadConfig()
	const app = createHarnessApp(config)

	log.info("Starting pi-harness", {
		port: config.port,
		host: config.host,
		maxSessions: config.maxSessions || "unlimited",
		idleTimeout: config.sessionIdleTimeoutMinutes || "none",
		auth: config.apiKey ? "api-key" : "none",
	})

	serve(
		{
			fetch: app.fetch,
			port: config.port,
			hostname: config.host,
		},
		(info) => {
			log.info(`Pi-harness listening on http://${info.address}:${info.port}`)
		},
	)

	// Graceful shutdown
	const shutdown = (signal: string) => {
		log.info(`Received ${signal}, shutting down...`)
		process.exit(0)
	}

	process.on("SIGTERM", () => shutdown("SIGTERM"))
	process.on("SIGINT", () => shutdown("SIGINT"))
}

main()
