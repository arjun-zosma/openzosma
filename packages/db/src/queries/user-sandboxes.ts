import type pg from "pg"
import type { SandboxStatus, UserSandbox } from "../types.js"

/**
 * Get the sandbox record for a user.
 * Each user has exactly one sandbox (enforced by unique index).
 */
export async function getByUserId(pool: pg.Pool, userId: string): Promise<UserSandbox | null> {
	const result = await pool.query("SELECT * FROM user_sandboxes WHERE user_id = $1", [userId])
	return result.rows[0] ? mapRow(result.rows[0]) : null
}

/** Get a sandbox record by its ID. */
export async function getById(pool: pg.Pool, id: string): Promise<UserSandbox | null> {
	const result = await pool.query("SELECT * FROM user_sandboxes WHERE id = $1", [id])
	return result.rows[0] ? mapRow(result.rows[0]) : null
}

/** Get a sandbox record by its OpenShell sandbox name. */
export async function getByName(pool: pg.Pool, sandboxName: string): Promise<UserSandbox | null> {
	const result = await pool.query("SELECT * FROM user_sandboxes WHERE sandbox_name = $1", [sandboxName])
	return result.rows[0] ? mapRow(result.rows[0]) : null
}

/** Create a new sandbox record for a user. */
export async function create(
	pool: pg.Pool,
	userId: string,
	sandboxName: string,
	policyTemplate = "default",
): Promise<UserSandbox> {
	const result = await pool.query(
		`INSERT INTO user_sandboxes (user_id, sandbox_name, status, policy_template)
		 VALUES ($1, $2, 'creating', $3)
		 RETURNING *`,
		[userId, sandboxName, policyTemplate],
	)
	return mapRow(result.rows[0])
}

/** Update the status of a sandbox. */
export async function updateStatus(pool: pg.Pool, id: string, status: SandboxStatus): Promise<UserSandbox | null> {
	if (status === "suspended") {
		const result = await pool.query(
			`UPDATE user_sandboxes
			 SET status = $2, last_active_at = now(), suspended_at = now()
			 WHERE id = $1
			 RETURNING *`,
			[id, status],
		)
		return result.rows[0] ? mapRow(result.rows[0]) : null
	}
	const result = await pool.query(
		`UPDATE user_sandboxes
		 SET status = $2, last_active_at = now()
		 WHERE id = $1
		 RETURNING *`,
		[id, status],
	)
	return result.rows[0] ? mapRow(result.rows[0]) : null
}

/** Touch the last_active_at timestamp. */
export async function touch(pool: pg.Pool, id: string): Promise<void> {
	await pool.query("UPDATE user_sandboxes SET last_active_at = now() WHERE id = $1", [id])
}

/** Update metadata JSON. */
export async function updateMetadata(
	pool: pg.Pool,
	id: string,
	metadata: Record<string, unknown>,
): Promise<UserSandbox | null> {
	const result = await pool.query(
		"UPDATE user_sandboxes SET metadata = $2, last_active_at = now() WHERE id = $1 RETURNING *",
		[id, JSON.stringify(metadata)],
	)
	return result.rows[0] ? mapRow(result.rows[0]) : null
}

/** Delete a sandbox record by ID. */
export async function deleteById(pool: pg.Pool, id: string): Promise<boolean> {
	const result = await pool.query("DELETE FROM user_sandboxes WHERE id = $1", [id])
	return (result.rowCount ?? 0) > 0
}

/** List all sandbox records, optionally filtered by status. */
export async function list(pool: pg.Pool, status?: SandboxStatus): Promise<UserSandbox[]> {
	if (status) {
		const result = await pool.query("SELECT * FROM user_sandboxes WHERE status = $1 ORDER BY last_active_at DESC", [
			status,
		])
		return result.rows.map(mapRow)
	}
	const result = await pool.query("SELECT * FROM user_sandboxes ORDER BY last_active_at DESC")
	return result.rows.map(mapRow)
}

/** Find sandboxes idle longer than the given duration (for suspension). */
export async function findIdle(pool: pg.Pool, idleThresholdMs: number): Promise<UserSandbox[]> {
	const result = await pool.query(
		`SELECT * FROM user_sandboxes
		 WHERE status = 'ready'
		   AND last_active_at < now() - ($1 || ' milliseconds')::interval
		 ORDER BY last_active_at ASC`,
		[idleThresholdMs.toString()],
	)
	return result.rows.map(mapRow)
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

function mapRow(row: Record<string, unknown>): UserSandbox {
	return {
		id: row.id as string,
		userId: row.user_id as string,
		sandboxName: row.sandbox_name as string,
		status: row.status as SandboxStatus,
		policyTemplate: row.policy_template as string,
		createdAt: row.created_at as Date,
		lastActiveAt: row.last_active_at as Date,
		suspendedAt: (row.suspended_at as Date) ?? null,
		metadata: (row.metadata as Record<string, unknown>) ?? {},
	}
}
