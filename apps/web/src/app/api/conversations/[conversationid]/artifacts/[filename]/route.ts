import { auth } from "@/src/lib/auth"
import { GATEWAY_URL } from "@/src/lib/constants"
import { pool } from "@/src/lib/db"
import { headers } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"

// GET /api/conversations/[conversationid]/artifacts/[filename]
export async function GET(
	req: NextRequest,
	{ params }: { params: Promise<{ conversationid: string; filename: string }> },
) {
	const reqheaders = await headers()
	const session = await auth.api.getSession({ headers: reqheaders })
	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
	}

	const { conversationid, filename } = await params

	// Verify user owns the conversation
	const convresult = await pool.query("SELECT id FROM public.conversations WHERE id = $1 AND deletedat IS NULL", [
		conversationid,
	])
	if (convresult.rows.length === 0) {
		return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
	}

	// Pass through download query param
	const download = req.nextUrl.searchParams.get("download")
	const queryString = download === "true" ? "?download=true" : ""

	// Proxy to gateway
	try {
		const gatewayUrl = `${GATEWAY_URL}/api/v1/sessions/${conversationid}/artifacts/${encodeURIComponent(filename)}${queryString}`
		const response = await fetch(gatewayUrl)

		if (!response.ok) {
			return NextResponse.json({ error: "Artifact not found" }, { status: response.status })
		}

		const contentType = response.headers.get("Content-Type") ?? "application/octet-stream"
		const contentLength = response.headers.get("Content-Length")
		const contentDisposition = response.headers.get("Content-Disposition")

		const responseHeaders = new Headers()
		responseHeaders.set("Content-Type", contentType)
		if (contentLength) responseHeaders.set("Content-Length", contentLength)
		if (contentDisposition) responseHeaders.set("Content-Disposition", contentDisposition)
		responseHeaders.set("Cache-Control", "private, max-age=3600")

		return new NextResponse(response.body, {
			status: 200,
			headers: responseHeaders,
		})
	} catch (err) {
		console.error("[artifacts] Failed to fetch file from gateway:", err)
		return NextResponse.json({ error: "Failed to fetch artifact" }, { status: 502 })
	}
}
