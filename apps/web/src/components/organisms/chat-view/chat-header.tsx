"use client"

import { Badge } from "@/src/components/ui/badge"
import { Button } from "@/src/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/src/components/ui/tooltip"
import { IconMessageCircle, IconRobot, IconUser } from "@tabler/icons-react"
import { FileIcon } from "lucide-react"
import type { ChatParticipant, ConversationData } from "./types"

type ChatHeaderProps = {
	conversation: ConversationData | null
	participants: ChatParticipant[]
	filescount: number
	onToggleFiles: () => void
	filespanelopen: boolean
}

const ChatHeader = ({ conversation, participants, filescount, onToggleFiles, filespanelopen }: ChatHeaderProps) => {
	return (
		<div className="flex items-center justify-between border-b px-6 py-3 shrink-0">
			<div className="flex items-center gap-3">
				<IconMessageCircle className="size-5 text-muted-foreground" />
				<div>
					<h3 className="font-semibold text-sm">{conversation?.title || "Conversation"}</h3>
					<div className="flex items-center gap-1.5 mt-0.5">
						{participants.map((p) => (
							<Badge key={p.id} variant="outline" className="text-[10px] px-1.5 py-0">
								{p.participanttype === "agent" ? (
									<IconRobot className="size-2.5 mr-0.5" />
								) : (
									<IconUser className="size-2.5 mr-0.5" />
								)}
								{p.participantname || p.participantid}
							</Badge>
						))}
					</div>
				</div>
			</div>
			<div className="flex items-center gap-2">
				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant={filespanelopen ? "secondary" : "ghost"}
								size="sm"
								onClick={onToggleFiles}
								className="gap-1.5"
							>
								<FileIcon className="size-3.5" />
								<span className="text-xs">Files</span>
								{filescount > 0 && (
									<span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0 rounded-full ml-0.5">
										{filescount}
									</span>
								)}
							</Button>
						</TooltipTrigger>
						<TooltipContent>{filespanelopen ? "Close files panel" : "Open files panel"}</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			</div>
		</div>
	)
}

export default ChatHeader
