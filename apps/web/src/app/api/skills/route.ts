import { auth } from "@/src/lib/auth"
import { pool } from "@/src/lib/db"
import { headers } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"

// GET /api/skills?type=builtin|marketplace|custom
export async function GET(request: NextRequest) {
	const session = await auth.api.getSession({ headers: await headers() })
	if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

	const { searchParams } = new URL(request.url)
	const type = searchParams.get("type")
	const installedBy = searchParams.get("installedBy")

	try {
		let query = "SELECT * FROM public.skills ORDER BY created_at DESC"
		const values: unknown[] = []

		if (type) {
			query = "SELECT * FROM public.skills WHERE type = $1 ORDER BY created_at DESC"
			values.push(type)
		} else if (installedBy) {
			query = "SELECT * FROM public.skills WHERE installed_by = $1 ORDER BY created_at DESC"
			values.push(installedBy)
		}

		const result = await pool.query(query, values)

		const integrationsResult = await pool.query("SELECT DISTINCT type FROM public.integrations WHERE status = 'active'")
		const configuredTypes = new Set(integrationsResult.rows.map((r: { type: string }) => r.type))

		const skillsWithIntegrationStatus = result.rows.map((skill: Record<string, unknown>) => {
			const config = skill.config as { requires?: string[] } | null
			const requires = config?.requires ?? []
			const missingIntegrations = requires.filter((r: string) => !configuredTypes.has(r))
			return { ...skill, missing_integrations: missingIntegrations }
		})

		return NextResponse.json({ skills: skillsWithIntegrationStatus })
	} catch (error) {
		return NextResponse.json({ error: `Failed to fetch skills: ${(error as Error).message}` }, { status: 500 })
	}
}

// POST /api/skills — create custom skill
export async function POST(request: NextRequest) {
	const session = await auth.api.getSession({ headers: await headers() })
	if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

	try {
		const body = await request.json()
		const { name, description, source, content, packageSpecifier, config } = body

		if (!name) {
			return NextResponse.json({ error: "Missing required field: name" }, { status: 400 })
		}

		const result = await pool.query(
			`INSERT INTO public.skills (name, description, type, source, content, package_specifier, config, installed_by)
       VALUES ($1, $2, 'custom', $3, $4, $5, $6, $7)
       RETURNING *`,
			[
				name,
				description ?? "",
				source ?? "file",
				content ?? null,
				packageSpecifier ?? null,
				JSON.stringify(config ?? {}),
				session.user.id,
			],
		)

		return NextResponse.json({ skill: result.rows[0] }, { status: 201 })
	} catch (error) {
		return NextResponse.json({ error: `Failed to create skill: ${(error as Error).message}` }, { status: 500 })
	}
}
