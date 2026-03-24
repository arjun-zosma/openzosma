"use client"

import { Avatar, AvatarFallback } from "@/src/components/ui/avatar"
import { IconRobot, IconUser } from "@tabler/icons-react"
import { DownloadIcon, FileIcon } from "lucide-react"
import RenderAgentContent from "./render-agent-content"
import type { ChatAttachment, ChatMessage as ChatMessageType, FileArtifact } from "./types"

const formatsizebytes = (bytes: number | null): string => {
	if (!bytes) return ""
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

type AttachmentListProps = {
	attachments: ChatAttachment[]
}

const AttachmentList = ({ attachments }: AttachmentListProps) => {
	// Filter out artifact-type attachments (handled by inline cards)
	const nonartifact = attachments.filter((att) => att.type !== "artifact")
	if (nonartifact.length === 0) return null

	return (
		<div className="flex flex-wrap gap-2 mt-2">
			{nonartifact.map((att) => {
				if (att.mediatype?.startsWith("image/") && att.url) {
					return (
						<div key={att.id} className="relative rounded-lg overflow-hidden border max-w-xs">
							<img src={att.url} alt={att.filename || "Image"} className="max-h-48 object-contain" />
						</div>
					)
				}

				return (
					<a
						key={att.id}
						href={att.url || "#"}
						target="_blank"
						rel="noopener noreferrer"
						className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-accent transition-colors"
					>
						<FileIcon className="size-4 text-muted-foreground" />
						<div className="min-w-0">
							<p className="truncate font-medium text-xs">{att.filename || "Download"}</p>
							{att.sizebytes && <p className="text-[10px] text-muted-foreground">{formatsizebytes(att.sizebytes)}</p>}
						</div>
						<DownloadIcon className="size-3.5 text-muted-foreground shrink-0" />
					</a>
				)
			})}
		</div>
	)
}

type ChatMessageProps = {
	message: ChatMessageType
	sendername: string
	onPreviewArtifact?: (artifact: FileArtifact) => void
}

const ChatMessage = ({ message, sendername, onPreviewArtifact }: ChatMessageProps) => {
	const isagent = message.sendertype === "agent"
	const timestamp = new Date(message.createdat).toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
	})

	return (
		<div className="flex gap-3 w-full">
			<Avatar className="size-7 shrink-0 mt-1">
				<AvatarFallback className={isagent ? "bg-primary/10 text-primary" : "bg-secondary"}>
					{isagent ? <IconRobot className="size-3.5" /> : <IconUser className="size-3.5" />}
				</AvatarFallback>
			</Avatar>
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2 mb-1">
					<span className="font-medium text-sm">{sendername}</span>
					<span className="text-[10px] text-muted-foreground">{timestamp}</span>
				</div>
				{isagent ? (
					<RenderAgentContent message={message} onPreviewArtifact={onPreviewArtifact} />
				) : (
					<p className="text-sm whitespace-pre-wrap">{message.content}</p>
				)}
				{message.attachments && <AttachmentList attachments={message.attachments} />}
			</div>
		</div>
	)
}

export default ChatMessage
