import type { AgentToolResult } from "@mariozechner/pi-agent-core"
import {
	createBashTool,
	createEditTool,
	createFindTool,
	createGrepTool,
	createLsTool,
	createReadTool,
	createWriteTool,
} from "@mariozechner/pi-coding-agent"
import type { ToolDefinition } from "@mariozechner/pi-coding-agent"
import { integrationQueries } from "@openzosma/db"
import type { IntegrationConfig } from "@openzosma/db"
import { executequery, getschema, safeDecrypt } from "@openzosma/integrations"
import {
	createReportExecuteCodeTool,
	createReportGenerateTool,
	createReportListTemplatesTool,
} from "@openzosma/skill-reports"
import { Type } from "@sinclair/typebox"
import type pg from "pg"

export type BuiltInToolName =
	| "read"
	| "bash"
	| "edit"
	| "write"
	| "grep"
	| "find"
	| "ls"
	| "report_list_templates"
	| "report_generate"
	| "report_execute_code"

export const createDefaultTools = (workspaceDir: string, toolsEnabled?: string[]) => {
	const allTools = [
		{ name: "read", tool: createReadTool(workspaceDir) },
		{ name: "bash", tool: createBashTool(workspaceDir) },
		{ name: "edit", tool: createEditTool(workspaceDir) },
		{ name: "write", tool: createWriteTool(workspaceDir) },
		{ name: "grep", tool: createGrepTool(workspaceDir) },
		{ name: "find", tool: createFindTool(workspaceDir) },
		{ name: "ls", tool: createLsTool(workspaceDir) },
		{ name: "report_list_templates", tool: createReportListTemplatesTool() },
		{ name: "report_generate", tool: createReportGenerateTool() },
		{ name: "report_execute_code", tool: createReportExecuteCodeTool() },
	] as const

	if (!toolsEnabled || toolsEnabled.length === 0) {
		return allTools.map((t) => t.tool)
	}

	const allow = new Set(toolsEnabled)
	return allTools.filter((t) => allow.has(t.name)).map((t) => t.tool)
}

// ─── Database tools ───────────────────────────────────────────────────────────

const textResult = (text: string): AgentToolResult<unknown> => ({
	content: [{ type: "text", text }],
	details: {},
})

const decryptconfig = (config: IntegrationConfig) => ({
	host: safeDecrypt(config.host),
	port: Number(safeDecrypt(typeof config.port === "number" ? String(config.port) : config.port)),
	database: safeDecrypt(config.database),
	username: safeDecrypt(config.username),
	password: safeDecrypt(config.password ?? ""),
	ssl: config.ssl,
})

/**
 * Create the query_database tool.
 *
 * Looks up the integration from @openzosma/db, decrypts credentials, and
 * executes the query via @openzosma/integrations connectors.
 */
export const createQueryDatabaseTool = (pool: pg.Pool): ToolDefinition => ({
	name: "query_database",
	label: "Query Database",
	description:
		"Execute a read-only SQL query against a connected database integration. " +
		"Use list_database_schemas first to discover available tables and columns. " +
		"Only SELECT statements are allowed.",
	promptSnippet: "query_database(integration_id, sql) — run a read-only SQL query against a saved integration",
	parameters: Type.Object({
		integration_id: Type.String({ description: "The UUID of the database integration to query." }),
		sql: Type.String({ description: "A read-only SQL SELECT query to execute." }),
	}),
	execute: async (_toolCallId, params, _signal, _onUpdate, _ctx): Promise<AgentToolResult<unknown>> => {
		const p = params as { integration_id: string; sql: string }
		const integration = await integrationQueries.getIntegration(pool, p.integration_id)
		if (!integration) return textResult(`Integration not found: ${p.integration_id}`)
		const result = await executequery(integration.type, decryptconfig(integration.config), p.sql)
		if (!result.success) return textResult(`Query failed: ${result.error}`)
		const summary = `${result.rowcount} row(s) returned in ${result.latencyms}ms`
		return textResult(JSON.stringify({ summary, fields: result.fields, rows: result.rows }, null, 2))
	},
})

/**
 * Create the list_database_schemas tool.
 *
 * Introspects table and column metadata from the target database so the agent
 * can write accurate queries without hallucinating column names.
 */
export const createListDatabaseSchemasTool = (pool: pg.Pool): ToolDefinition => ({
	name: "list_database_schemas",
	label: "List Database Schemas",
	description:
		"Inspect the tables and columns of a connected database integration. " +
		"Returns table names with their column names and data types. " +
		"Always call this before writing a query against an unfamiliar database.",
	promptSnippet: "list_database_schemas(integration_id) — introspect tables and columns of a saved integration",
	parameters: Type.Object({
		integration_id: Type.String({ description: "The UUID of the database integration to inspect." }),
	}),
	execute: async (_toolCallId, params, _signal, _onUpdate, _ctx): Promise<AgentToolResult<unknown>> => {
		const p = params as { integration_id: string }
		const integration = await integrationQueries.getIntegration(pool, p.integration_id)
		if (!integration) return textResult(`Integration not found: ${p.integration_id}`)
		try {
			const tables = await getschema(integration.type, decryptconfig(integration.config))
			if (tables.length === 0) return textResult("No tables found in the database.")
			const lines: string[] = [`Database: ${integration.name} (${integration.type})`, ""]
			for (const table of tables) {
				lines.push(`Table: ${table.table_name}`)
				for (const col of table.columns) {
					const nullable = col.is_nullable === "YES" ? " (nullable)" : ""
					lines.push(`  ${col.column_name}: ${col.data_type}${nullable}`)
				}
				lines.push("")
			}
			return textResult(lines.join("\n"))
		} catch (error) {
			return textResult(`Schema introspection failed: ${(error as Error).message}`)
		}
	},
})
