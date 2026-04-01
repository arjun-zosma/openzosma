"use client"

import { Badge } from "@/src/components/ui/badge"
import { Button } from "@/src/components/ui/button"
import { Separator } from "@/src/components/ui/separator"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/src/components/ui/tooltip"
import { IconClock, IconMessageCircle, IconRobot, IconUser } from "@tabler/icons-react"
import { FileIcon } from "lucide-react"
import type { ChatParticipant, ConversationData } from "./types"

type ChatHeaderProps = {
	conversation: ConversationData | null
	participants: ChatParticipant[]
	filescount: number
	messagecount: number
	onToggleFiles: () => void
	filespanelopen: boolean
}

const formatduration = (createdat: string, updatedat: string): string => {
	const start = new Date(createdat).getTime()
	const end = new Date(updatedat).getTime()
	const diffms = end - start
	if (diffms < 60_000) return "< 1 min"
	const mins = Math.floor(diffms / 60_000)
	if (mins < 60) return `${mins}m`
	const hrs = Math.floor(mins / 60)
	const remainmins = mins % 60
	return remainmins > 0 ? `${hrs}h ${remainmins}m` : `${hrs}h`
}

const ChatHeader = ({
	conversation,
	participants,
	filescount,
	messagecount,
	onToggleFiles,
	filespanelopen,
}: ChatHeaderProps) => {
	const agentparticipants = participants.filter((p) => p.participanttype === "agent")
	const humanparticipants = participants.filter((p) => p.participanttype === "human")

	return (
		<div className="flex items-center justify-between border-b px-6 py-3 shrink-0">
			<div className="flex items-center gap-3 min-w-0">
				<IconMessageCircle className="size-5 text-muted-foreground shrink-0" />
				<div className="min-w-0">
					<h3 className="font-semibold text-sm truncate">{conversation?.title || "Conversation"}</h3>
					<div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
						{agentparticipants.map((p) => (
							<Badge key={p.id} variant="outline" className="text-[10px] px-1.5 py-0">
								<IconRobot className="size-2.5 mr-0.5" />
								{p.participantname || p.participantid}
							</Badge>
						))}
						{humanparticipants.map((p) => (
							<Badge key={p.id} variant="outline" className="text-[10px] px-1.5 py-0">
								<IconUser className="size-2.5 mr-0.5" />
								{p.participantname || p.participantid}
							</Badge>
						))}
						{messagecount > 0 && (
							<>
								<Separator orientation="vertical" className="h-3" />
								<span className="text-[10px] text-muted-foreground">{messagecount} messages</span>
							</>
						)}
						{conversation && (
							<>
								<Separator orientation="vertical" className="h-3" />
								<span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
									<IconClock className="size-2.5" />
									{formatduration(conversation.createdat, conversation.updatedat)}
								</span>
							</>
						)}
					</div>
				</div>
			</div>
			<div className="flex items-center gap-2 shrink-0">
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
