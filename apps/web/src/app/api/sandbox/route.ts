import { auth } from "@/src/lib/auth"
import { GATEWAY_URL } from "@/src/lib/constants"
import { headers } from "next/headers"
import { NextResponse } from "next/server"

/**
 * Proxy a request to the gateway's /api/v1/sandbox endpoint,
 * forwarding the session cookie for authentication.
 */
const proxyToGateway = async (method: string) => {
	const reqHeaders = await headers()
	const session = await auth.api.getSession({ headers: reqHeaders })
	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
	}

	try {
		const response = await fetch(`${GATEWAY_URL}/api/v1/sandbox`, {
			method,
			headers: {
				cookie: reqHeaders.get("cookie") ?? "",
			},
		})

		const data = await response.json()
		return NextResponse.json(data, { status: response.status })
	} catch (err) {
		console.error(`[sandbox] Gateway proxy failed (${method}):`, err)
		return NextResponse.json({ error: "Failed to reach gateway" }, { status: 502 })
	}
}

/**
 * GET /api/sandbox
 *
 * Returns the current user's sandbox info (name, status, timestamps).
 */
export const GET = () => proxyToGateway("GET")

/**
 * DELETE /api/sandbox
 *
 * Destroys the current user's sandbox.
 */
export const DELETE = () => proxyToGateway("DELETE")
