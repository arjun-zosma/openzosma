import { auth } from "@/src/lib/auth"
import { pool } from "@/src/lib/db"
import { headers } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"

// GET /api/conversations
export async function GET(req: NextRequest) {
	const reqheaders = await headers()
	const session = await auth.api.getSession({ headers: reqheaders })
	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
	}

	const result = await pool.query(
		`SELECT c.id, c.title, c.createdby, c.createdat, c.updatedat,
            (SELECT content FROM public.messages m
             WHERE m.conversationid = c.id AND m.deletedat IS NULL
             ORDER BY m.createdat DESC LIMIT 1) as lastmessage,
            (SELECT COUNT(*) FROM public.messages m
             WHERE m.conversationid = c.id AND m.deletedat IS NULL)::int as messagecount,
            (SELECT participantname FROM public.conversationparticipants cp
             WHERE cp.conversationid = c.id AND cp.participanttype = 'agent' AND cp.deletedat IS NULL
             LIMIT 1) as agentname
     FROM public.conversations c
     WHERE c.deletedat IS NULL
     ORDER BY c.updatedat DESC`,
	)

	return NextResponse.json({ conversations: result.rows })
}

// POST /api/conversations
export async function POST(req: NextRequest) {
	const reqheaders = await headers()
	const session = await auth.api.getSession({ headers: reqheaders })
	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
	}

	const body = await req.json()
	const { title, agentid, agentname } = body

	const userid = session.user.id
	const username = session.user.name

	// Create conversation
	const convresult = await pool.query(
		`INSERT INTO public.conversations (title, createdby)
     VALUES ($1, $2)
     RETURNING id, title, createdby, createdat, updatedat`,
		[title || "New Conversation", userid],
	)

	const conversation = convresult.rows[0]

	// Add human participant
	await pool.query(
		`INSERT INTO public.conversationparticipants (conversationid, participanttype, participantid, participantname)
     VALUES ($1, 'human', $2, $3)`,
		[conversation.id, userid, username],
	)

	// Add agent participant if provided
	if (agentid) {
		await pool.query(
			`INSERT INTO public.conversationparticipants (conversationid, participanttype, participantid, participantname)
       VALUES ($1, 'agent', $2, $3)`,
			[conversation.id, agentid, agentname || agentid],
		)
	}

	return NextResponse.json({ conversation }, { status: 201 })
}
