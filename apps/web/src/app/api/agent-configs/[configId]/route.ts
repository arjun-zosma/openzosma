import { auth } from "@/src/lib/auth"
import { pool } from "@/src/lib/db"
import { headers } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"

type RouteParams = { params: Promise<{ configId: string }> }

// GET /api/agent-configs/:configId
export async function GET(_request: NextRequest, { params }: RouteParams) {
	const session = await auth.api.getSession({ headers: await headers() })
	if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

	const { configId } = await params

	try {
		const result = await pool.query("SELECT * FROM agent_configs WHERE id = $1", [configId])
		if (result.rows.length === 0) {
			return NextResponse.json({ error: "Agent config not found" }, { status: 404 })
		}
		return NextResponse.json({ config: result.rows[0] })
	} catch (error) {
		return NextResponse.json({ error: `Failed to fetch agent config: ${(error as Error).message}` }, { status: 500 })
	}
}

// PUT /api/agent-configs/:configId
export async function PUT(request: NextRequest, { params }: RouteParams) {
	const session = await auth.api.getSession({ headers: await headers() })
	if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

	const { configId } = await params

	try {
		const existing = await pool.query("SELECT id FROM agent_configs WHERE id = $1", [configId])
		if (existing.rows.length === 0) {
			return NextResponse.json({ error: "Agent config not found" }, { status: 404 })
		}

		const body = await request.json()
		const { name, description, model, provider, systemPrompt, toolsEnabled, skills, maxTokens, temperature } = body

		const fields: string[] = []
		const values: unknown[] = []
		let paramIndex = 1

		if (name !== undefined) {
			fields.push(`name = $${paramIndex++}`)
			values.push(name)
		}
		if (description !== undefined) {
			fields.push(`description = $${paramIndex++}`)
			values.push(description)
		}
		if (model !== undefined) {
			fields.push(`model = $${paramIndex++}`)
			values.push(model)
		}
		if (provider !== undefined) {
			fields.push(`provider = $${paramIndex++}`)
			values.push(provider)
		}
		if (systemPrompt !== undefined) {
			fields.push(`system_prompt = $${paramIndex++}`)
			values.push(systemPrompt)
		}
		if (toolsEnabled !== undefined) {
			fields.push(`tools_enabled = $${paramIndex++}`)
			values.push(JSON.stringify(toolsEnabled))
		}
		if (skills !== undefined) {
			fields.push(`skills = $${paramIndex++}`)
			values.push(JSON.stringify(skills))
		}
		if (maxTokens !== undefined) {
			fields.push(`max_tokens = $${paramIndex++}`)
			values.push(maxTokens)
		}
		if (temperature !== undefined) {
			fields.push(`temperature = $${paramIndex++}`)
			values.push(temperature)
		}

		if (fields.length === 0) {
			return NextResponse.json({ error: "No fields to update" }, { status: 400 })
		}

		fields.push("updated_at = now()")
		values.push(configId)

		const result = await pool.query(
			`UPDATE agent_configs SET ${fields.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
			values,
		)
		return NextResponse.json({ config: result.rows[0] })
	} catch (error) {
		return NextResponse.json({ error: `Failed to update agent config: ${(error as Error).message}` }, { status: 500 })
	}
}
