import { auth } from "@/src/lib/auth"
import { GATEWAY_URL } from "@/src/lib/constants"
import { pool } from "@/src/lib/db"
import { headers } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"

// GET /api/conversations/[conversationid]/artifacts
export async function GET(_req: NextRequest, { params }: { params: Promise<{ conversationid: string }> }) {
	const reqheaders = await headers()
	const session = await auth.api.getSession({ headers: reqheaders })
	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
	}

	const { conversationid } = await params

	// Verify user owns the conversation
	const convresult = await pool.query("SELECT id FROM public.conversations WHERE id = $1 AND deletedat IS NULL", [
		conversationid,
	])
	if (convresult.rows.length === 0) {
		return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
	}

	// Proxy to gateway
	try {
		const response = await fetch(`${GATEWAY_URL}/api/v1/sessions/${conversationid}/artifacts`)
		const data = await response.json()
		return NextResponse.json(data)
	} catch (err) {
		console.error("[artifacts] Failed to fetch from gateway:", err)
		return NextResponse.json({ error: "Failed to fetch artifacts" }, { status: 502 })
	}
}
