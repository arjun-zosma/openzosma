import type { CreateFilePayload } from "@/src/services/knowledge-base.services"
import knowledgeBaseService from "@/src/services/knowledge-base.services"
import { QUERY_KEYS } from "@/src/utils/query-keys"
import { useMutation, useQueryClient } from "@tanstack/react-query"

const useCreateKbFile = () => {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: (payload: CreateFilePayload) => knowledgeBaseService.createFile(payload),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.KB_TREE] })
		},
	})
}

export default useCreateKbFile
