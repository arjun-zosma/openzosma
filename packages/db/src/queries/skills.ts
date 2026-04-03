import type pg from "pg"
import type { Skill } from "../types.js"

/**
 * List skills with optional filters. Supports filtering by type, installedBy, or both.
 */
export const listSkills = async (pool: pg.Pool, opts?: { type?: string; installedBy?: string }): Promise<Skill[]> => {
	const conditions: string[] = []
	const values: unknown[] = []
	let paramIndex = 1

	if (opts?.type !== undefined) {
		conditions.push(`type = $${paramIndex++}`)
		values.push(opts.type)
	}
	if (opts?.installedBy !== undefined) {
		conditions.push(`installed_by = $${paramIndex++}`)
		values.push(opts.installedBy)
	}

	const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""
	const result = await pool.query(`SELECT * FROM skills ${where} ORDER BY created_at DESC`, values)
	return result.rows.map(mapSkill)
}

/**
 * Fetch a single skill by ID. Returns null if not found.
 */
export const getSkill = async (pool: pg.Pool, id: string): Promise<Skill | null> => {
	const result = await pool.query("SELECT * FROM skills WHERE id = $1", [id])
	return result.rows[0] ? mapSkill(result.rows[0]) : null
}

/**
 * Create a new skill record.
 */
export const createSkill = async (
	pool: pg.Pool,
	data: {
		name: string
		description?: string
		type?: string
		source?: string
		content?: string | null
		packageSpecifier?: string | null
		config?: Record<string, unknown>
		installedBy?: string | null
	},
): Promise<Skill> => {
	const result = await pool.query(
		`INSERT INTO skills (name, description, type, source, content, package_specifier, config, installed_by)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 RETURNING *`,
		[
			data.name,
			data.description ?? "",
			data.type ?? "custom",
			data.source ?? "file",
			data.content ?? null,
			data.packageSpecifier ?? null,
			JSON.stringify(data.config ?? {}),
			data.installedBy ?? null,
		],
	)
	return mapSkill(result.rows[0])
}

/**
 * Update a skill's mutable fields. Returns null if the skill does not exist.
 */
export const updateSkill = async (
	pool: pg.Pool,
	id: string,
	updates: Partial<{
		name: string
		description: string
		content: string | null
		packageSpecifier: string | null
		config: Record<string, unknown>
	}>,
): Promise<Skill | null> => {
	const fields: string[] = []
	const values: unknown[] = []
	let paramIndex = 1

	if (updates.name !== undefined) {
		fields.push(`name = $${paramIndex++}`)
		values.push(updates.name)
	}
	if (updates.description !== undefined) {
		fields.push(`description = $${paramIndex++}`)
		values.push(updates.description)
	}
	if (updates.content !== undefined) {
		fields.push(`content = $${paramIndex++}`)
		values.push(updates.content)
	}
	if (updates.packageSpecifier !== undefined) {
		fields.push(`package_specifier = $${paramIndex++}`)
		values.push(updates.packageSpecifier)
	}
	if (updates.config !== undefined) {
		fields.push(`config = $${paramIndex++}`)
		values.push(JSON.stringify(updates.config))
	}

	if (fields.length === 0) return getSkill(pool, id)

	fields.push("updated_at = now()")
	values.push(id)

	const result = await pool.query(
		`UPDATE skills SET ${fields.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
		values,
	)
	return result.rows[0] ? mapSkill(result.rows[0]) : null
}

/**
 * Delete a skill by ID.
 */
export const deleteSkill = async (pool: pg.Pool, id: string): Promise<void> => {
	await pool.query("DELETE FROM skills WHERE id = $1", [id])
}

/**
 * Fetch multiple skills by their IDs. Used at session creation to load
 * the agent's enabled skills in a single query.
 */
export const getSkillsByIds = async (pool: pg.Pool, ids: string[]): Promise<Skill[]> => {
	if (ids.length === 0) return []
	const result = await pool.query("SELECT * FROM skills WHERE id = ANY($1::uuid[])", [ids])
	return result.rows.map(mapSkill)
}

const mapSkill = (row: Record<string, unknown>): Skill => ({
	id: row.id as string,
	name: row.name as string,
	description: row.description as string,
	type: row.type as "builtin" | "marketplace" | "custom",
	source: row.source as "file" | "npm",
	content: row.content as string | null,
	packageSpecifier: row.package_specifier as string | null,
	config: row.config as { requires?: string[]; envVars?: string[] },
	installedBy: row.installed_by as string | null,
	createdAt: row.created_at as Date,
	updatedAt: row.updated_at as Date,
})
