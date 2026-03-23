import type { CreateFolderPayload } from "@/src/services/knowledge-base.services"
import knowledgeBaseService from "@/src/services/knowledge-base.services"
import { QUERY_KEYS } from "@/src/utils/query-keys"
import { useMutation, useQueryClient } from "@tanstack/react-query"

const useCreateKbFolder = () => {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: (payload: CreateFolderPayload) => knowledgeBaseService.createFolder(payload),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.KB_TREE] })
		},
	})
}

export default useCreateKbFolder
