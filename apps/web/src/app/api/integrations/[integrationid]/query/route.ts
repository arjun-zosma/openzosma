// AUTH
import { auth } from "@/src/lib/auth"
// LIB
import { pool } from "@/src/lib/db"
import { type ConnectionConfig, executequery } from "@/src/lib/db-connectors"
import { decrypt } from "@/src/lib/encryption"
import { headers } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safedecrypt(value: string): string {
	try {
		return decrypt(value)
	} catch {
		return value
	}
}

function decryptconfig(stored: {
	host: string
	port: string | number
	database: string
	username: string
	password: string
	ssl: boolean
}): ConnectionConfig {
	const portraw = typeof stored.port === "number" ? String(stored.port) : stored.port

	return {
		host: safedecrypt(stored.host),
		port: Number(safedecrypt(portraw)),
		database: safedecrypt(stored.database),
		username: safedecrypt(stored.username),
		password: safedecrypt(stored.password),
		ssl: stored.ssl,
	}
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest, { params }: { params: Promise<{ integrationid: string }> }) {
	const session = await auth.api.getSession({ headers: await headers() })
	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
	}

	const { integrationid } = await params

	try {
		const body = await request.json()
		const { query } = body

		// ── Validate inputs ──
		if (!query || typeof query !== "string" || !query.trim()) {
			return NextResponse.json({ error: "query is required and must be a non-empty string" }, { status: 400 })
		}

		// ── Read-only enforcement ──
		// Note: read-only checks and LIMIT enforcement are handled inside
		// executequery() at both the application and database level.

		// ── Fetch integration ──
		const integrationresult = await pool.query(
			`SELECT id, organizationid, type, config, status
       FROM public.integrations
       WHERE id = $1`,
			[integrationid],
		)

		if (integrationresult.rows.length === 0) {
			return NextResponse.json({ error: "Integration not found" }, { status: 404 })
		}

		const integration = integrationresult.rows[0]

		// ── Verify integration is active ──
		if (integration.status !== "active") {
			return NextResponse.json({ error: "Integration is not active" }, { status: 400 })
		}

		// ── Decrypt config and execute query ──
		const config = decryptconfig(integration.config)
		const result = await executequery(integration.type, config, query.trim())

		if (result.success) {
			return NextResponse.json({
				columns: result.fields,
				rows: result.rows,
			})
		}

		// Return the database error to the caller
		return NextResponse.json({ error: result.error }, { status: 500 })
	} catch (error) {
		return NextResponse.json({ error: `Server error: ${(error as Error).message}` }, { status: 500 })
	}
}
