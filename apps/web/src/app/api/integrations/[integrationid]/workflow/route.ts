// AUTH
import { auth } from "@/src/lib/auth"
// LIB
import { pool } from "@/src/lib/db"
import { headers } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"

// ─── POST: Start the integration setup workflow ───────────────────────────────

export async function POST(_request: NextRequest, { params }: { params: Promise<{ integrationid: string }> }) {
	const session = await auth.api.getSession({
		headers: await headers(),
	})
	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
	}

	const { integrationid } = await params

	try {
		// Verify integration exists
		const integrationresult = await pool.query(
			`SELECT id, organizationid, name, type, workflowstatus
       FROM public.integrations
       WHERE id = $1`,
			[integrationid],
		)

		if (integrationresult.rows.length === 0) {
			return NextResponse.json({ error: "Integration not found" }, { status: 404 })
		}

		const integration = integrationresult.rows[0]

		// Don't start if already running
		if (integration.workflowstatus === "running") {
			return NextResponse.json({
				workflowstatus: "running",
				message: "Workflow is already running",
			})
		}

		// Mark as running then immediately complete.
		// Full schema-indexing workflow is a future enhancement — the integration
		// is usable immediately via the query_database and list_database_schemas
		// agent tools without any pre-processing step.
		await pool.query(
			`UPDATE public.integrations
       SET workflowstatus = 'running', updatedat = NOW()
       WHERE id = $1`,
			[integrationid],
		)

		await pool.query(`UPDATE public.integrations SET workflowstatus = 'completed', updatedat = NOW() WHERE id = $1`, [
			integrationid,
		])

		return NextResponse.json({ workflowstatus: "completed" })
	} catch (error) {
		return NextResponse.json({ error: `Server error: ${(error as Error).message}` }, { status: 500 })
	}
}

// ─── GET: Check workflow status ───────────────────────────────────────────────

export async function GET(_request: NextRequest, { params }: { params: Promise<{ integrationid: string }> }) {
	const session = await auth.api.getSession({
		headers: await headers(),
	})
	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
	}

	const { integrationid } = await params

	try {
		const result = await pool.query(
			`SELECT workflowrunid, workflowstatus
       FROM public.integrations
       WHERE id = $1`,
			[integrationid],
		)

		if (result.rows.length === 0) {
			return NextResponse.json({ error: "Integration not found" }, { status: 404 })
		}

		const { workflowrunid, workflowstatus } = result.rows[0]

		return NextResponse.json({ workflowstatus, workflowrunid })
	} catch (error) {
		return NextResponse.json({ error: `Server error: ${(error as Error).message}` }, { status: 500 })
	}
}
