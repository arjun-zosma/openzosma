import { Badge } from "@/src/components/ui/badge"
import type { Skill } from "@/src/types/skills"
import { IconFileText, IconPackage } from "@tabler/icons-react"

const SkillSourceBadge = ({ source }: { source: Skill["source"] }) => (
	<Badge variant="secondary" className="gap-1">
		{source === "npm" ? <IconPackage className="size-3" /> : <IconFileText className="size-3" />}
		{source === "npm" ? "Package" : "File"}
	</Badge>
)

export default SkillSourceBadge
