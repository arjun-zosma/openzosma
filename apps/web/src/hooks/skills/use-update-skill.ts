import type { UpdateSkillPayload } from "@/src/services/skills.services"
import skillsService from "@/src/services/skills.services"
import { QUERY_KEYS } from "@/src/utils/query-keys"
import { useMutation, useQueryClient } from "@tanstack/react-query"

const useUpdateSkill = (id: string) => {
	const queryClient = useQueryClient()
	const { SKILL } = QUERY_KEYS
	return useMutation({
		mutationFn: (payload: UpdateSkillPayload) => skillsService.updateSkill(id, payload),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: [SKILL, id] })
		},
	})
}

export default useUpdateSkill
