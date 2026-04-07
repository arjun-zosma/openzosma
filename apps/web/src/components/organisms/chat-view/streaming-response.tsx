"use client"

import { MessageResponse } from "@/src/components/ai-elements/message"
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/src/components/ai-elements/reasoning"
import { Avatar, AvatarFallback } from "@/src/components/ui/avatar"
import { IconRobot } from "@tabler/icons-react"
import { ArtifactCardList } from "./artifact-card"
import ToolActivityPill from "./tool-calls"
import type { FileArtifact, MessageSegment, StreamToolCall } from "./types"

type StreamingResponseProps = {
	content: string
	toolcalls: StreamToolCall[]
	segments: MessageSegment[]
	reasoning: string
	isstreaming: boolean
	onPreviewArtifact?: (artifact: FileArtifact) => void
}

const TypingIndicator = () => {
	return (
		<div className="flex items-center gap-1 py-2">
			<div className="flex gap-1">
				<span className="size-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0ms]" />
				<span className="size-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:150ms]" />
				<span className="size-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:300ms]" />
			</div>
		</div>
	)
}

const StreamingResponse = ({
	content,
	toolcalls,
	segments,
	reasoning,
	isstreaming,
	onPreviewArtifact,
}: StreamingResponseProps) => {
	const toolmap = new Map(toolcalls.map((t) => [t.toolcallid, t]))
	const hasactivity = content || toolcalls.length > 0 || reasoning
	const hassegments = segments.length > 0

	return (
		<div className="flex gap-3 w-full">
			<Avatar className="size-7 shrink-0 mt-1">
				<AvatarFallback className="bg-primary/10 text-primary">
					<IconRobot className="size-3.5" />
				</AvatarFallback>
			</Avatar>
			<div className="flex-1 min-w-0 space-y-2">
				<div className="flex items-center gap-2 mb-1">
					<span className="font-medium text-sm">Open Zosma Agent</span>
				</div>

				{reasoning && (
					<Reasoning isStreaming={isstreaming && !content}>
						<ReasoningTrigger />
						<ReasoningContent>{reasoning}</ReasoningContent>
					</Reasoning>
				)}

				{hassegments ? (
					segments.map((seg, i) => {
						if (seg.type === "text") {
							return <MessageResponse key={i}>{seg.content}</MessageResponse>
						}
						if (seg.type === "files") {
							return <ArtifactCardList key={`files-${i}`} artifacts={seg.artifacts} onPreview={onPreviewArtifact} />
						}
						if (seg.type === "steer") {
							return (
								<div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground italic py-0.5">
									<span className="font-medium not-italic">↩</span>
									{seg.content}
								</div>
							)
						}
						const tool = toolmap.get(seg.toolcallid)
						if (!tool) return null
						return <ToolActivityPill key={seg.toolcallid} tool={tool} />
					})
				) : (
					<>
						{toolcalls.length > 0 && (
							<div className="space-y-1.5">
								{toolcalls.map((tool) => (
									<ToolActivityPill key={tool.toolcallid} tool={tool} />
								))}
							</div>
						)}
						{content && <MessageResponse>{content}</MessageResponse>}
					</>
				)}

				{!hasactivity && <TypingIndicator />}
			</div>
		</div>
	)
}

export default StreamingResponse
