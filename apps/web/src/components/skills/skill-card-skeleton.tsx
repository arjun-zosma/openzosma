import { Card, CardContent, CardHeader } from "@/src/components/ui/card"
import { Skeleton } from "@/src/components/ui/skeleton"

const SkillCardSkeleton = () => (
	<Card>
		<CardHeader className="pb-3">
			<Skeleton className="h-5 w-2/3" />
			<Skeleton className="h-4 w-full mt-2" />
		</CardHeader>
		<CardContent>
			<div className="flex gap-2">
				<Skeleton className="h-5 w-16" />
				<Skeleton className="h-5 w-14" />
			</div>
		</CardContent>
	</Card>
)

export default SkillCardSkeleton
