export interface SkillConfig {
	requires?: string[]
	envVars?: string[]
}

export interface Skill {
	id: string
	name: string
	description: string
	type: "builtin" | "marketplace" | "custom"
	source: "file" | "npm"
	content: string | null
	package_specifier: string | null
	config: SkillConfig
	installed_by: string | null
	missing_integrations?: string[]
	created_at: string
	updated_at: string
}

export type SkillTab = "all" | "builtin" | "custom"
