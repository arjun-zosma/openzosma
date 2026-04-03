import skillsService from "@/src/services/skills.services"
import { QUERY_KEYS } from "@/src/utils/query-keys"
import { useQuery } from "@tanstack/react-query"

export const useGetSkills = () => {
	const { SKILL } = QUERY_KEYS
	return useQuery({
		queryKey: [SKILL],
		queryFn: () => skillsService.getSkills(),
	})
}
