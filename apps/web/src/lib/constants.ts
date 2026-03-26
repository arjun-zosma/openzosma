import path from "node:path"
import { format } from "date-fns"

export const DATABASE_URL: string =
	process.env.DATABASE_URL ?? "postgresql://openzosma:openzosma@localhost:5432/openzosma"

export const BASE_URL: string = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"

export const LAST_LEGAL_UPDATE_DATE: string = format(new Date(2025, 10, 27), "MMMM d, yyyy")

export const IS_DEV = process.env.NODE_ENV === "development"

export const GATEWAY_URL: string = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:4000"

/**
 * Root directory for the knowledge base filesystem.
 * Uses `||` instead of `??` so that an empty string in env (e.g. `KNOWLEDGE_BASE_PATH=`)
 * falls through to the default path instead of resolving to "".
 */
export const KNOWLEDGE_BASE_PATH: string =
	process.env.KNOWLEDGE_BASE_PATH || path.join(process.cwd(), "../../.knowledge-base")
