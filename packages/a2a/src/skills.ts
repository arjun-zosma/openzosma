import { type Pool, skillQueries } from "@openzosma/db"
import type { AgentSkill } from "a2a-js"

/**
 * Static fallback metadata for the built-in skills. Used when the
 * database is unavailable (e.g. during initial setup or in tests).
 */
export const SKILL_METADATA: Record<string, Omit<AgentSkill, "id">> = {
	coding: {
		name: "Coding Assistant",
		description: "Read, write, and edit code. Execute commands. Debug issues.",
	},
	database: {
		name: "Database Querying",
		description: "Query PostgreSQL, MySQL, MongoDB, ClickHouse, BigQuery, and SQLite databases.",
	},
	reports: {
		name: "Report Generation",
		description: "Generate PDF reports, PPTX presentations, and data visualizations.",
	},
	"agent-slack": {
		name: "Slack Integration",
		description: "Interact with Slack channels, threads, and users.",
	},
}

/**
 * Resolve skill metadata for a list of skill IDs. Queries the database
 * for full skill records and falls back to the static SKILL_METADATA
 * map when the DB is unavailable or a skill isn't found.
 */
export const resolveSkillsMetadata = async (pool: Pool, skillIds: string[]): Promise<AgentSkill[]> => {
	if (skillIds.length === 0) return []

	try {
		const dbSkills = await skillQueries.getSkillsByIds(pool, skillIds)
		const dbMap = new Map(dbSkills.map((s) => [s.id, s]))

		return skillIds.map((id) => {
			const dbSkill = dbMap.get(id)
			if (dbSkill) {
				return {
					id,
					name: dbSkill.name,
					description: dbSkill.description || null,
				}
			}
			const fallback = SKILL_METADATA[id]
			return {
				id,
				name: fallback?.name ?? id,
				description: fallback?.description ?? null,
			}
		})
	} catch {
		return skillIds.map((id) => {
			const fallback = SKILL_METADATA[id]
			return {
				id,
				name: fallback?.name ?? id,
				description: fallback?.description ?? null,
			}
		})
	}
}
