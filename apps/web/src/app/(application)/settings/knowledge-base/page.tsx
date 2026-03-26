"use client"

import KnowledgeBasePanel from "@/src/components/organisms/knowledge-base"
// COMPONENTS
import { Button } from "@/src/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card"
import { QUERY_KEYS } from "@/src/utils/query-keys"
// ICONS
import { IconDatabase, IconLoader2, IconRefresh } from "@tabler/icons-react"
import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useState } from "react"
import { toast } from "sonner"

const KnowledgeBasePage = () => {
	const queryClient = useQueryClient()
	const [syncing, setSyncing] = useState(false)

	const handleSyncFromAgent = useCallback(async () => {
		setSyncing(true)
		try {
			const res = await fetch("/api/knowledge-base/sync")
			const data = (await res.json()) as { synced?: number; files?: string[]; error?: string }
			if (!res.ok) {
				toast.error(data.error ?? "Failed to sync from agent")
				return
			}
			toast.success(`Synced ${data.synced ?? 0} file(s) from agent`)
			// Invalidate KB tree and file queries so the UI refreshes
			await queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.KB_TREE] })
		} catch {
			toast.error("Failed to sync from agent")
		} finally {
			setSyncing(false)
		}
	}, [queryClient])

	return (
		<div className="flex flex-col w-full h-full">
			{/* Knowledge Base */}
			<Card className="h-full">
				<CardHeader>
					<div className="flex items-center justify-between">
						<div>
							<CardTitle className="text-base flex items-center gap-2">
								<IconDatabase className="size-4" />
								Knowledge Base
							</CardTitle>
							<CardDescription>Manage your knowledge base.</CardDescription>
						</div>
						<Button variant="outline" size="sm" onClick={handleSyncFromAgent} disabled={syncing}>
							{syncing ? <IconLoader2 className="size-4 animate-spin" /> : <IconRefresh className="size-4" />}
							Sync from Agent
						</Button>
					</div>
				</CardHeader>
				<CardContent className="flex flex-col gap-4 h-full">
					<KnowledgeBasePanel />
				</CardContent>
			</Card>
		</div>
	)
}

export default KnowledgeBasePage
