"use client"

import { Badge } from "@/src/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/src/components/ui/dialog"
import { ScrollArea } from "@/src/components/ui/scroll-area"
import { useGetSkill } from "@/src/hooks/skills/use-get-skill"
import type { Skill } from "@/src/types/skills"
import { IconLoader2, IconPackage } from "@tabler/icons-react"
import SkillSourceBadge from "./skill-source-badge"
import SkillTypeBadge from "./skill-type-badge"

interface SkillDetailDialogProps {
	skill: Skill | null
	onOpenChange: (open: boolean) => void
}

const SkillDetailDialog = ({ skill, onOpenChange }: SkillDetailDialogProps) => {
	const { data: fullSkill, isLoading } = useGetSkill(skill?.id ?? null)

	const displaySkill = fullSkill ?? skill

	return (
		<Dialog open={!!skill} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
				{displaySkill && (
					<>
						<DialogHeader>
							<DialogTitle>{displaySkill.name}</DialogTitle>
							<DialogDescription>{displaySkill.description || "No description"}</DialogDescription>
						</DialogHeader>
						<div className="flex items-center gap-2 flex-wrap">
							<SkillTypeBadge type={displaySkill.type} />
							<SkillSourceBadge source={displaySkill.source} />
							{displaySkill.package_specifier && (
								<Badge variant="outline" className="gap-1">
									<IconPackage className="size-3" />
									{displaySkill.package_specifier}
								</Badge>
							)}
						</div>
						{displaySkill.config?.requires && displaySkill.config.requires.length > 0 && (
							<div className="flex flex-col gap-2">
								<h4 className="text-sm font-medium">Required Integrations</h4>
								<div className="flex flex-wrap gap-2">
									{displaySkill.config.requires.map((req: string) => (
										<Badge
											key={req}
											variant={displaySkill.missing_integrations?.includes(req) ? "destructive" : "default"}
										>
											{req}
										</Badge>
									))}
								</div>
							</div>
						)}
						<ScrollArea className="flex-1 min-h-0 rounded-md border">
							{isLoading ? (
								<div className="flex items-center justify-center py-12">
									<IconLoader2 className="size-6 text-muted-foreground animate-spin" />
								</div>
							) : (
								<div className="p-4 text-sm font-mono whitespace-pre-wrap wrap-break-words overflow-y-scroll h-96">
									{displaySkill.content || "No content available."}
								</div>
							)}
						</ScrollArea>
						<p className="text-xs text-muted-foreground">
							Created {new Date(displaySkill.created_at).toLocaleDateString()}
							{displaySkill.updated_at && displaySkill.updated_at !== displaySkill.created_at && (
								<> &middot; Updated {new Date(displaySkill.updated_at).toLocaleDateString()}</>
							)}
						</p>
					</>
				)}
			</DialogContent>
		</Dialog>
	)
}

export default SkillDetailDialog
