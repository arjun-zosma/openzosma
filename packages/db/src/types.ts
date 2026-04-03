// -- Agent Configs --

export interface AgentConfig {
	id: string
	name: string
	description: string | null
	model: string
	provider: string
	systemPrompt: string | null
	toolsEnabled: string[]
	skills: string[]
	maxTokens: number
	temperature: number
	createdAt: Date
	updatedAt: Date
}

// -- API Keys --

export interface ApiKey {
	id: string
	name: string
	keyHash: string
	keyPrefix: string
	scopes: string[]
	lastUsedAt: Date | null
	expiresAt: Date | null
	createdAt: Date
}

// -- Usage --

export interface UsageRecord {
	id: string
	sessionId: string | null
	tokensIn: number
	tokensOut: number
	cost: number
	model: string | null
	createdAt: Date
}

// -- Connections --

export type ConnectionType = "postgresql" | "mysql" | "mongodb" | "clickhouse" | "bigquery" | "sqlite" | "generic_sql"

export interface Connection {
	id: string
	name: string
	type: ConnectionType
	encryptedCredentials: string
	schemaCache: unknown | null
	readOnly: boolean
	queryTimeout: number
	rowLimit: number
	createdAt: Date
	updatedAt: Date
}

// -- Integrations --

export type IntegrationStatus = "inactive" | "active" | "error"

/** Encrypted connection config as stored in the integrations table. */
export interface IntegrationConfig {
	host: string
	port: string | number
	database: string
	username: string
	password: string
	ssl: boolean
}

export interface Integration {
	id: string
	organizationId: string
	teamId: string
	name: string
	type: string
	config: IntegrationConfig
	status: IntegrationStatus
	createdBy: string
	createdAt: Date
	updatedAt: Date
}

// -- Settings --

export interface Setting {
	key: string
	value: unknown
	updatedAt: Date
}

// -- User Sandboxes --

export type SandboxStatus = "creating" | "provisioning" | "ready" | "suspended" | "error" | "deleting" | "deleted"

export interface UserSandbox {
	id: string
	userId: string
	sandboxName: string
	status: SandboxStatus
	policyTemplate: string
	createdAt: Date
	lastActiveAt: Date
	suspendedAt: Date | null
	metadata: Record<string, unknown>
}

// -- Skills --

export interface Skill {
	id: string
	name: string
	description: string
	type: "builtin" | "marketplace" | "custom"
	source: "file" | "npm"
	content: string | null
	packageSpecifier: string | null
	config: { requires?: string[]; envVars?: string[] }
	installedBy: string | null
	createdAt: Date
	updatedAt: Date
}
