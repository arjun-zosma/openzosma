import type { CreateSkillPayload } from "@/src/services/skills.services"
import skillsService from "@/src/services/skills.services"
import { QUERY_KEYS } from "@/src/utils/query-keys"
import { useMutation, useQueryClient } from "@tanstack/react-query"

const useCreateSkill = () => {
	const queryClient = useQueryClient()
	const { SKILL } = QUERY_KEYS

	return useMutation({
		mutationFn: (payload: CreateSkillPayload) => skillsService.createSkill(payload),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: [SKILL] })
		},
	})
}

export default useCreateSkill
