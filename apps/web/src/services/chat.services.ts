import type { ChatMessage, ChatParticipant, ConversationData } from "@/src/components/organisms/chat-view/types"
import { ApiService } from "."

export type ConversationSummary = {
	id: string
	title: string
	createdby: string
	createdat: string
	updatedat: string
	lastmessage: string | null
	messagecount: number
	agentname: string | null
}

export type CreateConversationPayload = {
	title: string
	agentid: string
	agentname: string
}

export type SaveMessagePayload = {
	sendertype: string
	senderid: string
	content: string
	metadata?: Record<string, unknown>
	attachments?: {
		type: string
		filename: string
		mediatype: string
		url: string
		sizebytes: number
	}[]
}

export type ConversationDetail = {
	conversation: ConversationData
	participants: ChatParticipant[]
	messages: ChatMessage[]
}

export class ChatService {
	private apiService: ApiService

	constructor() {
		this.apiService = new ApiService()
	}

	async listConversations(): Promise<ConversationSummary[]> {
		const { data } = await this.apiService.get<{ conversations: ConversationSummary[] }>("/api/conversations")
		return data?.conversations ?? []
	}

	async createConversation(payload: CreateConversationPayload): Promise<ConversationData> {
		const { data } = await this.apiService.post<{ conversation: ConversationData }>("/api/conversations", payload)
		return data!.conversation
	}

	async deleteConversation(id: string): Promise<void> {
		await this.apiService.delete(`/api/conversations/${id}`)
	}

	async getConversation(id: string): Promise<ConversationDetail> {
		const { data } = await this.apiService.get<ConversationDetail>(`/api/conversations/${id}`)
		return data!
	}

	async saveMessage(conversationid: string, payload: SaveMessagePayload): Promise<ChatMessage | null> {
		const { data } = await this.apiService.post<{ message: ChatMessage }>(
			`/api/conversations/${conversationid}/messages`,
			payload,
		)
		return data?.message ?? null
	}
}

const chatService = new ChatService()

export default chatService
