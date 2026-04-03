import { Button } from "@/src/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/src/components/ui/empty"
import type { SkillTab } from "@/src/types/skills"
import { IconBolt, IconPlus } from "@tabler/icons-react"

const emptyMessages: Record<SkillTab, string> = {
	all: "No skills found. Create a custom skill to get started.",
	builtin: "No built-in skills available.",
	custom: "No custom skills yet. Create one to extend your agent.",
}

interface SkillsEmptyStateProps {
	tab: SkillTab
	onCreateClick: () => void
}

const SkillsEmptyState = ({ tab, onCreateClick }: SkillsEmptyStateProps) => (
	<Empty className="py-16">
		<EmptyHeader>
			<EmptyMedia variant="icon">
				<IconBolt className="size-5" />
			</EmptyMedia>
			<EmptyTitle>No skills</EmptyTitle>
			<EmptyDescription>{emptyMessages[tab]}</EmptyDescription>
		</EmptyHeader>
		{tab !== "builtin" && (
			<Button variant="outline" onClick={onCreateClick}>
				<IconPlus className="size-4" />
				Create Skill
			</Button>
		)}
	</Empty>
)

export default SkillsEmptyState
