import mysql from "mysql2/promise"
import pg from "pg"

export interface ConnectionConfig {
	host: string
	port: number
	database: string
	username: string
	password: string
	ssl?: boolean
}

export interface QueryResult {
	success: boolean
	rows?: Record<string, unknown>[]
	fields?: string[]
	rowcount: number
	error?: string
	latencyms?: number
}

export interface SchemaTable {
	table_name: string
	columns: SchemaColumn[]
}

export interface SchemaColumn {
	column_name: string
	data_type: string
	is_nullable: string
}

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

const isreadonly = (query: string): boolean => {
	const normalized = query.trim().toUpperCase()
	return !BLOCKED_KEYWORDS.some((kw) => normalized.startsWith(kw) || normalized.includes(` ${kw} `))
}

const ensafelimit = (query: string, maxrows = 1000): string => {
	const upper = query.trim().toUpperCase()
	if (upper.includes("LIMIT")) return query
	return `${query.trimEnd()}\nLIMIT ${maxrows}`
}

const QUERY_TIMEOUT_MS = 30_000

export const querypostgresql = async (config: ConnectionConfig, query: string): Promise<QueryResult> => {
	if (!isreadonly(query)) {
		return { success: false, rows: [], fields: [], rowcount: 0, error: "Only read-only queries are allowed" }
	}
	const safequery = ensafelimit(query)
	const start = Date.now()
	const pool = new pg.Pool({
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
			await client.query("BEGIN TRANSACTION READ ONLY")
			const result = await client.query(safequery)
			await client.query("COMMIT")
			return {
				success: true,
				rows: result.rows as Record<string, unknown>[],
				fields: result.fields?.map((f) => f.name) ?? [],
				rowcount: result.rowCount ?? result.rows?.length ?? 0,
				latencyms: Date.now() - start,
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

export const querymysql = async (config: ConnectionConfig, query: string): Promise<QueryResult> => {
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
		await connection.query(`SET SESSION MAX_EXECUTION_TIME = ${QUERY_TIMEOUT_MS}`)
		await connection.query("SET SESSION TRANSACTION READ ONLY")
		await connection.query("START TRANSACTION")
		const [rows, fields] = await connection.query(safequery)
		await connection.query("COMMIT")
		const rowarray = Array.isArray(rows) ? rows : []
		return {
			success: true,
			rows: rowarray as Record<string, unknown>[],
			fields: Array.isArray(fields) ? fields.map((f) => f.name) : [],
			rowcount: rowarray.length,
			latencyms: Date.now() - start,
		}
	} catch (error) {
		if (connection) await connection.query("ROLLBACK").catch(() => {})
		return {
			success: false,
			rows: [],
			fields: [],
			rowcount: 0,
			error: (error as Error).message,
			latencyms: Date.now() - start,
		}
	} finally {
		if (connection) await connection.end()
	}
}

export const executequery = async (type: string, config: ConnectionConfig, query: string): Promise<QueryResult> => {
	switch (type) {
		case "postgresql":
			return querypostgresql(config, query)
		case "mysql":
			return querymysql(config, query)
		default:
			return { success: false, rows: [], fields: [], rowcount: 0, error: `Unsupported database type: ${type}` }
	}
}

export const getschemapg = async (config: ConnectionConfig): Promise<SchemaTable[]> => {
	const pool = new pg.Pool({
		host: config.host,
		port: config.port,
		database: config.database,
		user: config.username,
		password: config.password,
		ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
		connectionTimeoutMillis: 10_000,
	})
	try {
		const client = await pool.connect()
		try {
			const result = await client.query<{
				table_name: string
				column_name: string
				data_type: string
				is_nullable: string
			}>(
				`SELECT t.table_name, c.column_name, c.data_type, c.is_nullable
         FROM information_schema.tables t
         JOIN information_schema.columns c ON c.table_name = t.table_name AND c.table_schema = t.table_schema
         WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema')
           AND t.table_type = 'BASE TABLE'
         ORDER BY t.table_name, c.ordinal_position`,
			)
			const tableMap = new Map<string, SchemaColumn[]>()
			for (const row of result.rows) {
				if (!tableMap.has(row.table_name)) tableMap.set(row.table_name, [])
				tableMap.get(row.table_name)!.push({
					column_name: row.column_name,
					data_type: row.data_type,
					is_nullable: row.is_nullable,
				})
			}
			return Array.from(tableMap.entries()).map(([table_name, columns]) => ({ table_name, columns }))
		} finally {
			client.release()
		}
	} finally {
		await pool.end()
	}
}

export const getschemamysql = async (config: ConnectionConfig): Promise<SchemaTable[]> => {
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
		const [rows] = await connection.query<mysql.RowDataPacket[]>(
			`SELECT LOWER(t.TABLE_NAME) AS table_name,
                    LOWER(c.COLUMN_NAME) AS column_name,
                    LOWER(c.DATA_TYPE) AS data_type,
                    c.IS_NULLABLE AS is_nullable
       FROM information_schema.TABLES t
       JOIN information_schema.COLUMNS c
         ON c.TABLE_NAME = t.TABLE_NAME AND c.TABLE_SCHEMA = t.TABLE_SCHEMA
       WHERE t.TABLE_SCHEMA = DATABASE() AND t.TABLE_TYPE = 'BASE TABLE'
       ORDER BY t.TABLE_NAME, c.ORDINAL_POSITION`,
		)
		const tableMap = new Map<string, SchemaColumn[]>()
		for (const row of rows) {
			if (!tableMap.has(row.table_name as string)) tableMap.set(row.table_name as string, [])
			tableMap.get(row.table_name as string)!.push({
				column_name: row.column_name as string,
				data_type: row.data_type as string,
				is_nullable: row.is_nullable as string,
			})
		}
		return Array.from(tableMap.entries()).map(([table_name, columns]) => ({ table_name, columns }))
	} finally {
		if (connection) await connection.end()
	}
}

export const getschema = async (type: string, config: ConnectionConfig): Promise<SchemaTable[]> => {
	switch (type) {
		case "postgresql":
			return getschemapg(config)
		case "mysql":
			return getschemamysql(config)
		default:
			throw new Error(`Unsupported database type: ${type}`)
	}
}
