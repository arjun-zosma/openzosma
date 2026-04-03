import { auth } from "@/src/lib/auth"
import { pool } from "@/src/lib/db"
import { headers } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"

// GET /api/skills/:skillId
export async function GET(_request: NextRequest, { params }: { params: Promise<{ skillId: string }> }) {
	const session = await auth.api.getSession({ headers: await headers() })
	if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

	const { skillId } = await params

	try {
		const result = await pool.query("SELECT * FROM public.skills WHERE id = $1", [skillId])
		if (result.rows.length === 0) {
			return NextResponse.json({ error: "Skill not found" }, { status: 404 })
		}
		return NextResponse.json({ skill: result.rows[0] })
	} catch (error) {
		return NextResponse.json({ error: `Failed to fetch skill: ${(error as Error).message}` }, { status: 500 })
	}
}

// PUT /api/skills/:skillId — update custom/marketplace skill
export async function PUT(request: NextRequest, { params }: { params: Promise<{ skillId: string }> }) {
	const session = await auth.api.getSession({ headers: await headers() })
	if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

	const { skillId } = await params

	try {
		const existing = await pool.query("SELECT id, type FROM public.skills WHERE id = $1", [skillId])
		if (existing.rows.length === 0) {
			return NextResponse.json({ error: "Skill not found" }, { status: 404 })
		}
		if (existing.rows[0].type === "builtin") {
			return NextResponse.json({ error: "Built-in skills cannot be modified" }, { status: 400 })
		}

		const body = await request.json()
		const { name, description, content, packageSpecifier, config } = body

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
		if (content !== undefined) {
			fields.push(`content = $${paramIndex++}`)
			values.push(content)
		}
		if (packageSpecifier !== undefined) {
			fields.push(`package_specifier = $${paramIndex++}`)
			values.push(packageSpecifier)
		}
		if (config !== undefined) {
			fields.push(`config = $${paramIndex++}`)
			values.push(JSON.stringify(config))
		}

		if (fields.length === 0) {
			return NextResponse.json({ error: "No fields to update" }, { status: 400 })
		}

		fields.push("updated_at = now()")
		values.push(skillId)

		const result = await pool.query(
			`UPDATE public.skills SET ${fields.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
			values,
		)
		return NextResponse.json({ skill: result.rows[0] })
	} catch (error) {
		return NextResponse.json({ error: `Failed to update skill: ${(error as Error).message}` }, { status: 500 })
	}
}

// DELETE /api/skills/:skillId
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ skillId: string }> }) {
	const session = await auth.api.getSession({ headers: await headers() })
	if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

	const { skillId } = await params

	try {
		const existing = await pool.query("SELECT id, type FROM public.skills WHERE id = $1", [skillId])
		if (existing.rows.length === 0) {
			return NextResponse.json({ error: "Skill not found" }, { status: 404 })
		}
		if (existing.rows[0].type === "builtin") {
			return NextResponse.json({ error: "Built-in skills cannot be deleted" }, { status: 400 })
		}

		await pool.query("DELETE FROM public.skills WHERE id = $1", [skillId])
		return NextResponse.json({ success: true })
	} catch (error) {
		return NextResponse.json({ error: `Failed to delete skill: ${(error as Error).message}` }, { status: 500 })
	}
}
