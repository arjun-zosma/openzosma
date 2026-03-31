"use client"

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/src/components/ui/alert-dialog"
import { Badge } from "@/src/components/ui/badge"
import { Button } from "@/src/components/ui/button"
import { Input } from "@/src/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/src/components/ui/select"
import { Skeleton } from "@/src/components/ui/skeleton"
import useDeleteConversation from "@/src/hooks/chat/use-delete-conversation"
import useGetConversations from "@/src/hooks/chat/use-get-conversations"
import { cn } from "@/src/lib/utils"
import { IconMessageCircle, IconPlus, IconRobot, IconSearch, IconTrash } from "@tabler/icons-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { toast } from "sonner"

type DateFilter = "all" | "today" | "week" | "month"

const iswithinrange = (datestr: string, filter: DateFilter): boolean => {
	if (filter === "all") return true
	const date = new Date(datestr)
	const now = new Date()
	const startoftoday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
	if (filter === "today") return date >= startoftoday
	if (filter === "week") {
		const weekago = new Date(startoftoday)
		weekago.setDate(weekago.getDate() - 6)
		return date >= weekago
	}
	if (filter === "month") {
		const monthago = new Date(startoftoday)
		monthago.setDate(monthago.getDate() - 29)
		return date >= monthago
	}
	return true
}

const formattime = (datestr: string): string => {
	const date = new Date(datestr)
	const now = new Date()
	const diffms = now.getTime() - date.getTime()
	const diffhrs = diffms / (1000 * 60 * 60)

	if (diffhrs < 1) return "Just now"
	if (diffhrs < 24) return `${Math.floor(diffhrs)}h ago`
	if (diffhrs < 48) return "Yesterday"
	return date.toLocaleDateString()
}

const ConversationSkeleton = () => (
	<div className="flex flex-col gap-1 p-2">
		{Array.from({ length: 5 }).map((_, i) => (
			<div key={i} className="flex flex-col gap-1.5 rounded-lg p-3">
				<Skeleton className="h-3.5 w-3/4" />
				<Skeleton className="h-2.5 w-full" />
				<Skeleton className="h-2.5 w-1/3" />
			</div>
		))}
	</div>
)

const ChatSidebar = ({ onNavigate }: { onNavigate?: () => void }) => {
	const router = useRouter()
	const pathname = usePathname()
	const [search, setSearch] = useState("")
	const [datefilter, setDatefilter] = useState<DateFilter>("all")
	const [agentfilter, setAgentfilter] = useState("all")
	const [pendingdeleteid, setPendingdeleteid] = useState<string | null>(null)

	const activeconversationid = pathname.split("/chat/")[1] || null

	const { data: conversations = [], isLoading: loading } = useGetConversations()
	const deleteConversation = useDeleteConversation()

	const agentnames = useMemo(() => {
		const names = new Set<string>()
		for (const c of conversations) {
			if (c.agentname) names.add(c.agentname)
		}
		return Array.from(names).sort()
	}, [conversations])

	const filteredconversations = useMemo(
		() =>
			conversations.filter((c) => {
				const matchessearch =
					c.title.toLowerCase().includes(search.toLowerCase()) ||
					(c.agentname?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
					(c.lastmessage?.toLowerCase().includes(search.toLowerCase()) ?? false)
				const matchesdate = iswithinrange(c.updatedat, datefilter)
				const matchesagent = agentfilter === "all" || c.agentname === agentfilter
				return matchessearch && matchesdate && matchesagent
			}),
		[conversations, search, datefilter, agentfilter],
	)

	const handledeleteconfirm = async () => {
		if (!pendingdeleteid) return
		const idtodelete = pendingdeleteid
		setPendingdeleteid(null)
		try {
			await deleteConversation.mutateAsync(idtodelete)
			toast.success("Conversation deleted")
			if (activeconversationid === idtodelete) {
				router.push("/chat")
			}
		} catch {
			toast.error("Failed to delete conversation")
		}
	}

	const hasactivefilters = search !== "" || datefilter !== "all" || agentfilter !== "all"

	return (
		<>
			<div className="flex flex-col h-full w-full bg-sidebar border-r">
				{/* Header */}
				<div className="flex items-center justify-between p-4 border-b shrink-0">
					<h3 className="font-semibold text-sm">Conversations</h3>
					<Button size="icon-sm" variant="ghost" asChild>
						<Link href="/chat" onClick={onNavigate}>
							<IconPlus className="size-4" />
						</Link>
					</Button>
				</div>

				{/* Search + Filters */}
				<div className="p-3 shrink-0 flex flex-col gap-2">
					<div className="relative">
						<IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
						<Input
							placeholder="Search conversations..."
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							className="pl-8 h-8 text-sm"
						/>
					</div>
					<div className="flex gap-1.5">
						<Select value={datefilter} onValueChange={(v) => setDatefilter(v as DateFilter)}>
							<SelectTrigger className="h-7 text-xs flex-1">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All time</SelectItem>
								<SelectItem value="today">Today</SelectItem>
								<SelectItem value="week">Last 7 days</SelectItem>
								<SelectItem value="month">Last 30 days</SelectItem>
							</SelectContent>
						</Select>
						{agentnames.length > 0 && (
							<Select value={agentfilter} onValueChange={setAgentfilter}>
								<SelectTrigger className="h-7 text-xs flex-1">
									<SelectValue placeholder="Agent" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All agents</SelectItem>
									{agentnames.map((name) => (
										<SelectItem key={name} value={name}>
											{name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						)}
					</div>
				</div>

				{/* Conversation List */}
				<div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
					{loading ? (
						<ConversationSkeleton />
					) : filteredconversations.length === 0 ? (
						<div className="flex flex-col items-center gap-3 py-8 px-4">
							<IconMessageCircle className="size-8 text-muted-foreground/50" />
							<p className="text-xs text-muted-foreground text-center">
								{hasactivefilters ? "No matching conversations" : "No conversations yet"}
							</p>
							{!hasactivefilters && (
								<Button size="sm" variant="outline" className="text-xs" asChild>
									<Link href="/chat" onClick={onNavigate}>
										<IconPlus className="size-3" />
										Start a conversation
									</Link>
								</Button>
							)}
						</div>
					) : (
						<div className="flex flex-col gap-1 p-2">
							{filteredconversations.map((conv) => (
								<div
									key={conv.id}
									role="button"
									tabIndex={0}
									onClick={() => {
										router.push(`/chat/${conv.id}`)
										onNavigate?.()
									}}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											router.push(`/chat/${conv.id}`)
											onNavigate?.()
										}
									}}
									className={cn(
										"group flex flex-col gap-1 rounded-lg p-3 text-left transition-colors cursor-pointer",
										activeconversationid === conv.id ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
									)}
								>
									{/* Title + delete */}
									<div className="flex items-center gap-2">
										<span
											className="text-sm font-medium flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
											style={{ minWidth: 0 }}
										>
											{conv.title}
										</span>
										<button
											type="button"
											onClick={(e) => {
												e.stopPropagation()
												setPendingdeleteid(conv.id)
											}}
											className="hidden group-hover:flex shrink-0 items-center justify-center w-6 h-6 rounded hover:bg-destructive/10"
											aria-label="Delete conversation"
										>
											<IconTrash className="size-3.5 text-muted-foreground hover:text-destructive" />
										</button>
									</div>

									{/* Last message preview */}
									<span
										className="text-xs text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap"
										style={{ minWidth: 0 }}
									>
										{conv.lastmessage ?? "No messages yet"}
									</span>

									{/* Agent + timestamp */}
									<div className="flex items-center justify-between gap-2 mt-0.5">
										{conv.agentname ? (
											<Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 gap-0.5">
												<IconRobot className="size-2.5" />
												{conv.agentname}
											</Badge>
										) : (
											<span />
										)}
										<span className="text-[10px] text-muted-foreground/70 shrink-0 whitespace-nowrap">
											{formattime(conv.updatedat)}
										</span>
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			</div>

			{/* Delete confirmation dialog */}
			<AlertDialog open={pendingdeleteid !== null} onOpenChange={(open) => !open && setPendingdeleteid(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete conversation?</AlertDialogTitle>
						<AlertDialogDescription>
							This will permanently delete the conversation and all its messages. This action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={handledeleteconfirm}
							className="bg-destructive text-white hover:bg-destructive/90"
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	)
}

export default ChatSidebar
