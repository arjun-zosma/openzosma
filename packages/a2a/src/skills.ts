import type { AgentSkill } from "a2a-js"

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
}
