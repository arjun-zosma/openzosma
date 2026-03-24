export type ChatParticipant = {
	id: string
	participanttype: string
	participantid: string
	participantname: string | null
	joinedat: string
}

export type ChatAttachment = {
	id: string
	type: string
	filename: string | null
	mediatype: string | null
	url: string | null
	sizebytes: number | null
	metadata: Record<string, unknown>
}

export type ChatMessage = {
	id: string
	sendertype: string
	senderid: string
	content: string
	metadata: Record<string, unknown>
	createdat: string
	attachments: ChatAttachment[]
}

export type ConversationData = {
	id: string
	title: string
	createdby: string
	createdat: string
	updatedat: string
}

export type StreamToolCall = {
	toolcallid: string
	toolname: string
	args: Record<string, unknown> | string
	state: "calling" | "streaming-args" | "result" | "error"
	result?: unknown
	iserror?: boolean
}

export type FileArtifact = {
	filename: string
	mediatype: string
	sizebytes: number
}

export type MessageSegment =
	| { type: "text"; content: string }
	| { type: "tool"; toolcallid: string }
	| { type: "files"; artifacts: FileArtifact[] }
