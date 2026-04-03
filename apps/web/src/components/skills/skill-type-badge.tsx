import { Badge } from "@/src/components/ui/badge"
import type { Skill } from "@/src/types/skills"

const typeBadgeConfig: Record<Skill["type"], { label: string; className: string }> = {
	builtin: {
		label: "Built-in",
		className: "border-blue-500/30 bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-300",
	},
	marketplace: {
		label: "Marketplace",
		className: "border-purple-500/30 bg-purple-50 text-purple-700 dark:bg-purple-950/20 dark:text-purple-300",
	},
	custom: {
		label: "Custom",
		className: "border-green-500/30 bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-300",
	},
}

const SkillTypeBadge = ({ type }: { type: Skill["type"] }) => {
	const config = typeBadgeConfig[type]
	return (
		<Badge variant="outline" className={config.className}>
			{config.label}
		</Badge>
	)
}

export default SkillTypeBadge
