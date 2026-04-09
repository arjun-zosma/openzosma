"use client"
import { Button } from "@/src/components/ui/button"
import { Input } from "@/src/components/ui/input"
import { ScrollArea } from "@/src/components/ui/scroll-area"
import { Skeleton } from "@/src/components/ui/skeleton"
import useDeleteConversation from "@/src/hooks/chat/use-delete-conversation"
import useGetConversations from "@/src/hooks/chat/use-get-conversations"
import { cn } from "@/src/lib/utils"
import type { ConversationSummary } from "@/src/services/chat.services"
import { IconChevronLeft, IconMessageCircle, IconSearch, IconTrash, IconX } from "@tabler/icons-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { toast } from "sonner"

interface DateGroup {
	label: string
	items: ConversationSummary[]
}

const groupByDate = (conversations: ConversationSummary[]): DateGroup[] => {
	const now = new Date()
	const sod = (offsetDays = 0): Date => {
		const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
		d.setDate(d.getDate() + offsetDays)
		return d
	}

	const groups: DateGroup[] = [
		{ label: "Today", items: [] },
		{ label: "Yesterday", items: [] },
		{ label: "Previous 7 days", items: [] },
		{ label: "Previous 30 days", items: [] },
		{ label: "Older", items: [] },
	]

	const [today, yesterday, week, month] = [sod(0), sod(-1), sod(-6), sod(-29)]

	for (const conv of conversations) {
		const d = new Date(conv.updatedat)
		if (d >= today) groups[0].items.push(conv)
		else if (d >= yesterday) groups[1].items.push(conv)
		else if (d >= week) groups[2].items.push(conv)
		else if (d >= month) groups[3].items.push(conv)
		else groups[4].items.push(conv)
	}

	return groups.filter((g) => g.items.length > 0)
}

const ConversationSkeleton = () => (
	<div className="flex flex-col gap-0.5 px-2 pt-4">
		{[70, 50, 80, 55, 65, 45, 75].map((w, i) => (
			<div key={i} className="flex flex-col gap-1.5 rounded-md px-3 py-2.5">
				<Skeleton className="h-3" style={{ width: `${w}%` }} />
				<Skeleton className="h-2.5 w-2/5" />
			</div>
		))}
	</div>
)

interface ThreadItemProps {
	conv: ConversationSummary
	isactive: boolean
	onRequestDelete: (id: string) => Promise<unknown>
}

const ThreadItem = ({ conv, isactive, onRequestDelete }: ThreadItemProps) => (
	<div
		className={cn(
			"group relative flex items-center w-full overflow-hidden rounded-md transition-colors",
			isactive ? "bg-accent" : "hover:bg-accent/50",
		)}
	>
		<Link
			href={`/chat/${conv.id}`}
			className={cn(
				"flex-1 min-w-0 px-3 py-2 pr-7 rounded-md max-w-96",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset ",
			)}
		>
			<p
				className={cn(
					"text-sm font-medium truncate leading-snug",
					isactive ? "text-accent-foreground" : "text-foreground/90",
				)}
			>
				{conv.title}
			</p>
			{conv.lastmessage && (
				<p className="text-xs text-muted-foreground/70 mt-0.5 leading-snug pl-px w-0 min-w-full overflow-hidden whitespace-nowrap text-ellipsis">
					{conv.lastmessage}
				</p>
			)}
		</Link>

		<div
			className={cn(
				"absolute right-1 top-1/2 -translate-y-1/2 shrink-0 transition-opacity",
				"opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
			)}
		>
			<Button
				size={"icon"}
				variant={"outline"}
				className="bg-transparent hover:bg-transparent border-none"
				onClick={() => onRequestDelete(conv.id)}
			>
				<IconTrash color="red" />
			</Button>
		</div>
	</div>
)

interface ChatSidebarProps {
	onClose: () => void
}

const ChatSidebar = ({ onClose }: ChatSidebarProps) => {
	const pathname = usePathname()
	const [search, setSearch] = useState("")
	const router = useRouter()

	const activeconversationid = pathname.split("/chat/")[1] ?? null

	const { data: conversations = [], isLoading: loading } = useGetConversations()
	const deleteConversation = useDeleteConversation()

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase()
		if (!q) return conversations
		return conversations.filter(
			(c) =>
				c.title.toLowerCase().includes(q) ||
				(c.lastmessage?.toLowerCase().includes(q) ?? false) ||
				(c.agentname?.toLowerCase().includes(q) ?? false),
		)
	}, [conversations, search])

	const groups = useMemo(() => groupByDate(filtered), [filtered])

	const handleDelete = async (id: string) => {
		try {
			await deleteConversation.mutateAsync(id)
			toast.success("Conversation deleted")
			router.push("/chat")
		} catch (error) {
			toast.error("Failed to delete conversation", {
				description: (error as Error).message,
			})
		}
	}

	return (
		<>
			<div className="flex flex-col h-full w-full bg-sidebar border-r">
				<div className="flex items-center gap-1.5 px-4 pt-4 pb-3 shrink-0 border-b border-border/50">
					<button
						type="button"
						onClick={onClose}
						className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
						aria-label="Back to navigation"
					>
						<IconChevronLeft className="size-4" />
					</button>
					<span className="text-sm font-semibold flex-1 text-foreground select-none">Threads</span>
				</div>

				<div className="px-3 py-2.5 shrink-0">
					<div className="relative">
						<IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
						<Input
							placeholder="Search threads..."
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							className="pl-8 pr-7 h-8 text-sm bg-accent/30 border-transparent focus-visible:border-input focus-visible:bg-background"
						/>
						{search && (
							<button
								type="button"
								onClick={() => setSearch("")}
								className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
								aria-label="Clear search"
							>
								<IconX className="size-3.5" />
							</button>
						)}
					</div>
				</div>

				<ScrollArea className="flex-1 min-h-0">
					{loading ? (
						<ConversationSkeleton />
					) : filtered.length === 0 ? (
						<div className="flex flex-col items-center gap-3 py-16 px-6 text-center">
							<div className="rounded-full bg-accent p-3 shrink-0">
								<IconMessageCircle className="size-5 text-muted-foreground" />
							</div>
							<div>
								<p className="text-sm font-medium text-foreground">{search ? "No results" : "No threads yet"}</p>
								<p className="text-xs text-muted-foreground mt-1 leading-relaxed">
									{search ? "Try different keywords" : "Start a conversation to see it here"}
								</p>
							</div>
							{!search && (
								<Button size="sm" variant="outline" className="mt-1 h-8 text-xs" asChild>
									<Link href="/chat">New conversation</Link>
								</Button>
							)}
						</div>
					) : (
						<div className="px-2 pb-6 w-full">
							{groups.map((group) => (
								<div key={group.label}>
									<p className="px-3 pt-5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-foreground/50 select-none">
										{group.label}
									</p>
									<div className="flex flex-col gap-0.5">
										{group.items.map((conv) => (
											<ThreadItem
												key={conv.id}
												conv={conv}
												isactive={activeconversationid === conv.id}
												onRequestDelete={handleDelete}
											/>
										))}
									</div>
								</div>
							))}
						</div>
					)}
				</ScrollArea>
			</div>
		</>
	)
}

export default ChatSidebar
