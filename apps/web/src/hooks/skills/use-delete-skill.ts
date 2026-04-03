import skillsService from "@/src/services/skills.services"
import { QUERY_KEYS } from "@/src/utils/query-keys"
import { useMutation, useQueryClient } from "@tanstack/react-query"

const useDeleteSkill = (id: string) => {
	const queryClient = useQueryClient()
	const { SKILL } = QUERY_KEYS
	return useMutation({
		mutationFn: () => skillsService.deleteSkill(id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: [SKILL, id] })
		},
	})
}

export default useDeleteSkill
