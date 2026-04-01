import type pg from "pg"
import type { Integration, IntegrationConfig } from "../types.js"

function mapintegration(row: Record<string, unknown>): Integration {
	return {
		id: row.id as string,
		organizationId: row.organizationid as string,
		teamId: row.teamid as string,
		name: row.name as string,
		type: row.type as string,
		config: row.config as IntegrationConfig,
		status: row.status as Integration["status"],
		createdBy: row.createdby as string,
		createdAt: row.createdat as Date,
		updatedAt: row.updatedat as Date,
	}
}

/**
 * Fetch a single active integration by ID.
 * Returns null if not found or soft-deleted.
 */
export const getIntegration = async (pool: pg.Pool, id: string): Promise<Integration | null> => {
	const result = await pool.query<Record<string, unknown>>(
		`SELECT id, organizationid, teamid, name, type, config, status, createdby, createdat, updatedat
     FROM public.integrations
     WHERE id = $1`,
		[id],
	)
	return result.rows[0] ? mapintegration(result.rows[0]) : null
}

/**
 * List all active integrations, ordered by name.
 */
export const listIntegrations = async (pool: pg.Pool): Promise<Integration[]> => {
	const result = await pool.query<Record<string, unknown>>(
		`SELECT id, organizationid, teamid, name, type, config, status, createdby, createdat, updatedat
     FROM public.integrations
     ORDER BY name`,
	)
	return result.rows.map(mapintegration)
}
