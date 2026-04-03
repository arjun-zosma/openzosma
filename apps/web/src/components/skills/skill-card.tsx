import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu"
import type { Skill } from "@/src/types/skills"
import { IconAlertTriangle, IconDotsVertical, IconPencil, IconTrash } from "@tabler/icons-react"
import SkillSourceBadge from "./skill-source-badge"
import SkillTypeBadge from "./skill-type-badge"

interface SkillCardProps {
	skill: Skill
	onViewDetail: (skill: Skill) => void
	onEdit: (skill: Skill) => void
	onDelete: (id: string) => void
}

const SkillCard = ({ skill, onViewDetail, onEdit, onDelete }: SkillCardProps) => (
	<Card className="hover:border-primary/50 transition-colors cursor-pointer group" onClick={() => onViewDetail(skill)}>
		<CardHeader className="pb-3">
			<div className="flex items-center justify-between">
				<CardTitle className="text-base truncate capitalize">{skill.name}</CardTitle>
				{skill.type !== "builtin" && (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								onClick={(e) => e.stopPropagation()}
								className="rounded p-1 opacity-0 group-hover:opacity-100 hover:bg-accent transition-all"
							>
								<IconDotsVertical className="size-4 text-muted-foreground" />
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
							<DropdownMenuItem onClick={() => onEdit(skill)}>
								<IconPencil className="size-4" />
								Edit
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => onDelete(skill.id)} className="text-destructive focus:text-destructive">
								<IconTrash className="size-4" />
								Delete
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				)}
			</div>
			<CardDescription className="line-clamp-2">{skill.description || "No description"}</CardDescription>
		</CardHeader>
		<CardContent className="flex flex-col gap-2">
			<div className="flex items-center gap-2 flex-wrap">
				<SkillTypeBadge type={skill.type} />
				<SkillSourceBadge source={skill.source} />
			</div>
			{skill.missing_integrations && skill.missing_integrations.length > 0 && (
				<div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
					<IconAlertTriangle className="size-3.5" />
					<span className="text-xs">Missing: {skill.missing_integrations.join(", ")}</span>
				</div>
			)}
			<p className="text-xs text-muted-foreground">Created {new Date(skill.created_at).toLocaleDateString()}</p>
		</CardContent>
	</Card>
)

export default SkillCard
