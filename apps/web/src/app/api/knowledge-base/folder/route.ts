import fs from "node:fs"
import { resolveSafe, syncToGateway } from "@/src/lib/knowledge-base"
import { type NextRequest, NextResponse } from "next/server"

const POST = async (request: NextRequest) => {
	const body = (await request.json()) as { path: string }
	if (!body.path) return NextResponse.json({ error: "Missing path" }, { status: 400 })

	const abs = resolveSafe(body.path)
	if (!abs) return NextResponse.json({ error: "Invalid path" }, { status: 400 })

	fs.mkdirSync(abs, { recursive: true })

	// Folder creation doesn't need sandbox sync — the sandbox creates
	// parent directories automatically when a file is written via PUT /kb/*.

	return NextResponse.json({ ok: true })
}

const DELETE = async (request: NextRequest) => {
	const folderPath = request.nextUrl.searchParams.get("path")
	if (!folderPath) return NextResponse.json({ error: "Missing path" }, { status: 400 })

	const abs = resolveSafe(folderPath)
	if (!abs) return NextResponse.json({ error: "Invalid path" }, { status: 400 })

	try {
		fs.rmSync(abs, { recursive: true, force: true })
	} catch {
		return NextResponse.json({ error: "Folder not found" }, { status: 404 })
	}

	// Sync deletion to sandbox (fire-and-forget)
	const cookie = request.headers.get("cookie") ?? ""
	void syncToGateway(cookie, "delete", folderPath)

	return NextResponse.json({ ok: true })
}

export { POST, DELETE }
