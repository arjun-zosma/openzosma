import mysql from "mysql2/promise"
import { Pool as PgPool } from "pg"

export type ConnectionConfig = {
	host: string
	port: number
	database: string
	username: string
	password: string
	ssl?: boolean
}

export type ConnectionTestResult = {
	success: boolean
	message: string
	latencyms?: number
}

/**
 * Test a PostgreSQL connection.
 */
export async function testpostgresql(config: ConnectionConfig): Promise<ConnectionTestResult> {
	const start = Date.now()
	const pool = new PgPool({
		host: config.host,
		port: config.port,
		database: config.database,
		user: config.username,
		password: config.password,
		ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
		connectionTimeoutMillis: 10000,
	})

	try {
		const client = await pool.connect()
		try {
			const result = await client.query("SELECT version()")
			const latencyms = Date.now() - start
			const version = result.rows[0]?.version ?? "unknown"
			return {
				success: true,
				message: `Connected successfully. ${version}`,
				latencyms,
			}
		} finally {
			client.release()
		}
	} catch (error) {
		return {
			success: false,
			message: `Connection failed: ${(error as Error).message}`,
		}
	} finally {
		await pool.end()
	}
}

/**
 * Test a MySQL / MariaDB connection.
 */
export async function testmysql(config: ConnectionConfig): Promise<ConnectionTestResult> {
	const start = Date.now()
	let connection: mysql.Connection | null = null

	try {
		connection = await mysql.createConnection({
			host: config.host,
			port: config.port,
			database: config.database,
			user: config.username,
			password: config.password,
			ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
			connectTimeout: 10000,
		})

		const [rows] = await connection.query("SELECT VERSION() as version")
		const latencyms = Date.now() - start
		const version = (rows as { version: string }[])[0]?.version ?? "unknown"
		return {
			success: true,
			message: `Connected successfully. MySQL ${version}`,
			latencyms,
		}
	} catch (error) {
		return {
			success: false,
			message: `Connection failed: ${(error as Error).message}`,
		}
	} finally {
		if (connection) {
			await connection.end()
		}
	}
}

/**
 * Dispatcher — routes to the correct connector based on the db type.
 */
export async function testconnection(type: string, config: ConnectionConfig): Promise<ConnectionTestResult> {
	switch (type) {
		case "postgresql":
			return testpostgresql(config)
		case "mysql":
			return testmysql(config)
		default:
			return {
				success: false,
				message: `Unsupported database type: ${type}`,
			}
	}
}

// ─── Read-only enforcement ────────────────────────────────────────────────────

const BLOCKED_KEYWORDS = [
	"INSERT",
	"UPDATE",
	"DELETE",
	"DROP",
	"ALTER",
	"CREATE",
	"TRUNCATE",
	"GRANT",
	"REVOKE",
	"EXEC",
	"EXECUTE",
]

/**
 * Check that a query is read-only by inspecting its keywords.
 * This is an application-level safety check; the database-level read-only
 * transaction provides the authoritative enforcement.
 */
function isreadonly(query: string): boolean {
	const normalized = query.trim().toUpperCase()
	return !BLOCKED_KEYWORDS.some((kw) => normalized.startsWith(kw) || normalized.includes(` ${kw} `))
}

/**
 * If the query does not already contain a LIMIT clause, append one as a safety cap.
 */
function ensafelimit(query: string, maxrows = 1000): string {
	const upper = query.trim().toUpperCase()
	if (upper.includes("LIMIT")) return query
	return `${query.trimEnd()}\nLIMIT ${maxrows}`
}

// ─── Query Execution ──────────────────────────────────────────────────────────

export type QueryResult = {
	success: boolean
	rows?: Record<string, unknown>[]
	fields?: string[]
	rowcount: number
	error?: string
	latencyms?: number
}

const QUERY_TIMEOUT_MS = 30_000 // 30 seconds

/**
 * Execute a read-only SQL query against a PostgreSQL database.
 *
 * The query is user-provided by design (authenticated users run SQL against
 * their own connected databases). Safety is enforced at two levels:
 * 1. Application-level keyword blocklist (defense in depth)
 * 2. Database-level read-only transaction (authoritative enforcement)
 */
export async function querypostgresql(config: ConnectionConfig, query: string): Promise<QueryResult> {
	if (!isreadonly(query)) {
		return { success: false, rows: [], fields: [], rowcount: 0, error: "Only read-only queries are allowed" }
	}

	const safequery = ensafelimit(query)
	const start = Date.now()
	const pool = new PgPool({
		host: config.host,
		port: config.port,
		database: config.database,
		user: config.username,
		password: config.password,
		ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
		connectionTimeoutMillis: 10_000,
		statement_timeout: QUERY_TIMEOUT_MS,
	})

	try {
		const client = await pool.connect()
		try {
			// Enforce read-only at the database level so the server rejects
			// any write attempt regardless of the keyword check above.
			await client.query("BEGIN TRANSACTION READ ONLY")
			const result = await client.query(safequery) // CodeQL[js/sql-injection] -- intentionally user-provided; guarded by read-only transaction
			await client.query("COMMIT")
			const latencyms = Date.now() - start
			return {
				success: true,
				rows: result.rows,
				fields: result.fields?.map((f) => f.name) ?? [],
				rowcount: result.rowCount ?? result.rows?.length ?? 0,
				latencyms,
			}
		} catch (error) {
			await client.query("ROLLBACK").catch(() => {})
			throw error
		} finally {
			client.release()
		}
	} catch (error) {
		return {
			success: false,
			rows: [],
			fields: [],
			rowcount: 0,
			error: (error as Error).message,
			latencyms: Date.now() - start,
		}
	} finally {
		await pool.end()
	}
}

/**
 * Execute a read-only SQL query against a MySQL / MariaDB database.
 *
 * The query is user-provided by design (authenticated users run SQL against
 * their own connected databases). Safety is enforced at two levels:
 * 1. Application-level keyword blocklist (defense in depth)
 * 2. Database-level read-only transaction (authoritative enforcement)
 */
export async function querymysql(config: ConnectionConfig, query: string): Promise<QueryResult> {
	if (!isreadonly(query)) {
		return { success: false, rows: [], fields: [], rowcount: 0, error: "Only read-only queries are allowed" }
	}

	const safequery = ensafelimit(query)
	const start = Date.now()
	let connection: mysql.Connection | null = null

	try {
		connection = await mysql.createConnection({
			host: config.host,
			port: config.port,
			database: config.database,
			user: config.username,
			password: config.password,
			ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
			connectTimeout: 10_000,
		})

		// Set query timeout and enforce read-only at the database level
		await connection.query(`SET SESSION MAX_EXECUTION_TIME = ${QUERY_TIMEOUT_MS}`)
		await connection.query("SET SESSION TRANSACTION READ ONLY")
		await connection.query("START TRANSACTION")

		const [rows, fields] = await connection.query(safequery) // CodeQL[js/sql-injection] -- intentionally user-provided; guarded by read-only transaction
		await connection.query("COMMIT")

		const latencyms = Date.now() - start
		const rowarray = Array.isArray(rows) ? rows : []
		return {
			success: true,
			rows: rowarray as Record<string, unknown>[],
			fields: Array.isArray(fields) ? fields.map((f) => f.name) : [],
			rowcount: rowarray.length,
			latencyms,
		}
	} catch (error) {
		if (connection) {
			await connection.query("ROLLBACK").catch(() => {})
		}
		return {
			success: false,
			rows: [],
			fields: [],
			rowcount: 0,
			error: (error as Error).message,
			latencyms: Date.now() - start,
		}
	} finally {
		if (connection) {
			await connection.end()
		}
	}
}

/**
 * Dispatcher — execute a SQL query against the correct database type.
 * Read-only enforcement and LIMIT safety are applied within each connector.
 */
export async function executequery(type: string, config: ConnectionConfig, query: string): Promise<QueryResult> {
	switch (type) {
		case "postgresql":
			return querypostgresql(config, query)
		case "mysql":
			return querymysql(config, query)
		default:
			return {
				success: false,
				rows: [],
				fields: [],
				rowcount: 0,
				error: `Unsupported database type: ${type}`,
			}
	}
}
