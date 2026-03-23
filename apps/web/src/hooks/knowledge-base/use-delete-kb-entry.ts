import knowledgeBaseService from "@/src/services/knowledge-base.services"
import { QUERY_KEYS } from "@/src/utils/query-keys"
import { useMutation, useQueryClient } from "@tanstack/react-query"

const useDeleteKbEntry = () => {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: ({ path, type }: { path: string; type: "file" | "folder" }) =>
			type === "folder" ? knowledgeBaseService.deleteFolder(path) : knowledgeBaseService.deleteFile(path),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.KB_TREE] })
		},
	})
}

export default useDeleteKbEntry
