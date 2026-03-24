"use client"

import { Conversation, ConversationContent, ConversationScrollButton } from "@/src/components/ai-elements/conversation"
import { consumePendingMessage } from "@/src/lib/pending-message"
import { IconSparkles } from "@tabler/icons-react"
import { AnimatePresence, motion } from "framer-motion"
import { useParams } from "next/navigation"
import { useEffect, useRef } from "react"
import ChatHeader from "./chat-header"
import ChatMessage from "./chat-message"
import useChatStream from "./hooks/use-chat-stream"
import useConversation from "./hooks/use-conversation"
import PromptInput from "./prompt-input"
import StreamingResponse from "./streaming-response"

const ChatView = () => {
	const { conversationid } = useParams<{ conversationid: string }>()
	const textarearef = useRef<HTMLTextAreaElement>(null)
	const { conversation, participants, messages, loading } = useConversation(conversationid)
	const { streaming, streamingcontent, streamingtoolcalls, streamingsegments, streamingreasoning, handlesubmit } =
		useChatStream(conversationid, conversation, participants)

	useEffect(() => {
		if (loading) return
		const text = consumePendingMessage()
		if (text) {
			handlesubmit({ text, files: [] })
		}
	}, [loading, handlesubmit])

	const hasmessages = messages.length > 0 || streaming

	const getparticipantname = (senderid: string, sendertype: string) => {
		const participant = participants.find((p) => p.participantid === senderid && p.participanttype === sendertype)
		return participant?.participantname || (sendertype === "human" ? "You" : "Agent")
	}

	if (loading) {
		return (
			<div className="flex items-center justify-center h-full">
				<p className="text-sm text-muted-foreground">Loading conversation...</p>
			</div>
		)
	}

	return (
		<div className="relative flex flex-col h-full w-full">
			{/* Empty state: centered input */}
			<AnimatePresence>
				{!hasmessages && (
					<motion.div
						key="empty-state"
						initial={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: 40, transition: { duration: 0.3 } }}
						className="absolute inset-0 z-10 flex flex-col items-center justify-center px-4"
					>
						<div className="flex flex-col items-center gap-4 mb-8">
							<div className="rounded-full bg-primary/10 p-4">
								<IconSparkles className="size-8 text-primary" />
							</div>
							<div className="text-center space-y-1">
								<h2 className="text-2xl font-semibold tracking-tight">{conversation?.title || "Start chatting"}</h2>
								<p className="text-sm text-muted-foreground max-w-md">Send a message to begin the conversation.</p>
							</div>
						</div>
						<div className="w-full max-w-2xl">
							<PromptInput
								handlesubmit={handlesubmit}
								hasmessages={hasmessages}
								textarearef={textarearef as React.RefObject<HTMLTextAreaElement>}
								streaming={streaming}
							/>
						</div>
					</motion.div>
				)}
			</AnimatePresence>

			{/* Conversation layout: messages + docked input */}
			<AnimatePresence>
				{hasmessages && (
					<motion.div
						key="conversation-state"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1, transition: { duration: 0.3 } }}
						className="flex flex-col h-full"
					>
						<ChatHeader conversation={conversation} participants={participants} />

						<Conversation className="flex-1 min-h-0">
							<ConversationContent className="max-w-3xl mx-auto w-full py-6">
								{messages.map((msg) => (
									<ChatMessage
										key={msg.id}
										message={msg}
										sendername={getparticipantname(msg.senderid, msg.sendertype)}
									/>
								))}

								{streaming && (
									<StreamingResponse
										content={streamingcontent}
										toolcalls={streamingtoolcalls}
										segments={streamingsegments}
										reasoning={streamingreasoning}
										isstreaming={streaming}
									/>
								)}
							</ConversationContent>
							<ConversationScrollButton />
						</Conversation>

						<motion.div
							initial={{ opacity: 0, y: 20 }}
							animate={{
								opacity: 1,
								y: 0,
								transition: { duration: 0.3, delay: 0.1 },
							}}
							className="shrink-0 border-t"
						>
							<div className="max-w-3xl mx-auto w-full px-4 py-3">
								<PromptInput
									handlesubmit={handlesubmit}
									hasmessages={hasmessages}
									textarearef={textarearef as React.RefObject<HTMLTextAreaElement>}
									streaming={streaming}
								/>
							</div>
						</motion.div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	)
}

export default ChatView
