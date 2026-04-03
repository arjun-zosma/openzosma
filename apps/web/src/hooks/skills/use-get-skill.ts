import skillsService from "@/src/services/skills.services"
import { QUERY_KEYS } from "@/src/utils/query-keys"
import { useQuery } from "@tanstack/react-query"

export const useGetSkill = (id: string | null) => {
	const { SKILL } = QUERY_KEYS
	return useQuery({
		queryKey: [SKILL, id],
		queryFn: () => skillsService.getSkill(id!),
		enabled: !!id,
	})
}
