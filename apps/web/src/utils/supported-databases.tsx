import {
	SiClickhouse,
	SiCockroachlabs,
	SiMariadb,
	SiMongodb,
	SiMysql,
	SiPostgresql,
	SiRedis,
	SiSqlite,
} from "@icons-pack/react-simple-icons"
import type { ComponentType, SVGProps } from "react"

export type SupportedDatabase = {
	id: string
	name: string
	description: string
	Icon: ComponentType<SVGProps<SVGSVGElement>>
	enabled: boolean
	defaultport: number
}

// Fallback for databases whose brand logos are not freely redistributable
// (Oracle, Microsoft SQL Server). Renders a plain text abbreviation as an SVG.
const makeTextIcon =
	(label: string): ComponentType<SVGProps<SVGSVGElement>> =>
	(props) => (
		<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
			<text x="50%" y="55%" dominantBaseline="middle" textAnchor="middle" fontSize="9" fontWeight="bold">
				{label}
			</text>
		</svg>
	)

export const supporteddatabases: SupportedDatabase[] = [
	{
		id: "postgresql",
		name: "PostgreSQL",
		description: "Advanced open-source relational database",
		Icon: SiPostgresql,
		enabled: true,
		defaultport: 5432,
	},
	{
		id: "mysql",
		name: "MySQL",
		description: "Popular open-source relational database",
		Icon: SiMysql,
		enabled: true,
		defaultport: 3306,
	},
	{
		id: "mariadb",
		name: "MariaDB",
		description: "Community-developed fork of MySQL",
		Icon: SiMariadb,
		enabled: false,
		defaultport: 3306,
	},
	{
		id: "mssql",
		name: "Microsoft SQL Server",
		description: "Enterprise relational database by Microsoft",
		Icon: makeTextIcon("SQL"),
		enabled: false,
		defaultport: 1433,
	},
	{
		id: "oracle",
		name: "Oracle Database",
		description: "Enterprise-grade relational database",
		Icon: makeTextIcon("ORA"),
		enabled: false,
		defaultport: 1521,
	},
	{
		id: "sqlite",
		name: "SQLite",
		description: "Lightweight file-based relational database",
		Icon: SiSqlite,
		enabled: false,
		defaultport: 0,
	},
	{
		id: "mongodb",
		name: "MongoDB",
		description: "Document-oriented NoSQL database",
		Icon: SiMongodb,
		enabled: false,
		defaultport: 27017,
	},
	{
		id: "redis",
		name: "Redis",
		description: "In-memory key-value data store",
		Icon: SiRedis,
		enabled: false,
		defaultport: 6379,
	},
	{
		id: "cockroachdb",
		name: "CockroachDB",
		description: "Distributed SQL database for cloud-native apps",
		Icon: SiCockroachlabs,
		enabled: false,
		defaultport: 26257,
	},
	{
		id: "clickhouse",
		name: "ClickHouse",
		description: "Column-oriented OLAP database for analytics",
		Icon: SiClickhouse,
		enabled: false,
		defaultport: 8123,
	},
]
