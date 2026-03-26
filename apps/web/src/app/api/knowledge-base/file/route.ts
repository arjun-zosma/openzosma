import fs from "node:fs"
import path from "node:path"
import { resolveSafe, syncToGateway } from "@/src/lib/knowledge-base"
import { type NextRequest, NextResponse } from "next/server"

const GET = async (request: NextRequest) => {
	const filePath = request.nextUrl.searchParams.get("path")
	if (!filePath) return NextResponse.json({ error: "Missing path" }, { status: 400 })

	const abs = resolveSafe(filePath)
	if (!abs) return NextResponse.json({ error: "Invalid path" }, { status: 400 })

	try {
		const content = fs.readFileSync(abs, "utf-8")
		return NextResponse.json({ content })
	} catch {
		return NextResponse.json({ error: "File not found" }, { status: 404 })
	}
}

const POST = async (request: NextRequest) => {
	const body = (await request.json()) as { path: string; content?: string }
	if (!body.path) return NextResponse.json({ error: "Missing path" }, { status: 400 })

	const abs = resolveSafe(body.path)
	if (!abs) return NextResponse.json({ error: "Invalid path" }, { status: 400 })

	if (fs.existsSync(abs)) {
		return NextResponse.json({ error: "File already exists" }, { status: 409 })
	}

	const content = body.content ?? ""
	fs.mkdirSync(path.dirname(abs), { recursive: true })
	fs.writeFileSync(abs, content, "utf-8")

	// Sync to sandbox (fire-and-forget)
	const cookie = request.headers.get("cookie") ?? ""
	void syncToGateway(cookie, "write", body.path, content)

	return NextResponse.json({ ok: true })
}

const PUT = async (request: NextRequest) => {
	const body = (await request.json()) as { path: string; content: string }
	if (!body.path) return NextResponse.json({ error: "Missing path" }, { status: 400 })

	const abs = resolveSafe(body.path)
	if (!abs) return NextResponse.json({ error: "Invalid path" }, { status: 400 })

	fs.mkdirSync(path.dirname(abs), { recursive: true })
	fs.writeFileSync(abs, body.content, "utf-8")

	// Sync to sandbox (fire-and-forget)
	const cookie = request.headers.get("cookie") ?? ""
	void syncToGateway(cookie, "write", body.path, body.content)

	return NextResponse.json({ ok: true })
}

const DELETE = async (request: NextRequest) => {
	const filePath = request.nextUrl.searchParams.get("path")
	if (!filePath) return NextResponse.json({ error: "Missing path" }, { status: 400 })

	const abs = resolveSafe(filePath)
	if (!abs) return NextResponse.json({ error: "Invalid path" }, { status: 400 })

	try {
		fs.unlinkSync(abs)
	} catch {
		return NextResponse.json({ error: "File not found" }, { status: 404 })
	}

	// Sync to sandbox (fire-and-forget)
	const cookie = request.headers.get("cookie") ?? ""
	void syncToGateway(cookie, "delete", filePath)

	return NextResponse.json({ ok: true })
}

export { GET, POST, PUT, DELETE }
