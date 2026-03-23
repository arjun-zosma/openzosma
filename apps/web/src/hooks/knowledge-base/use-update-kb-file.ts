import type { UpdateFilePayload } from "@/src/services/knowledge-base.services"
import knowledgeBaseService from "@/src/services/knowledge-base.services"
import { useMutation } from "@tanstack/react-query"

const useUpdateKbFile = () => {
	return useMutation({
		mutationFn: (payload: UpdateFilePayload) => knowledgeBaseService.updateFile(payload),
	})
}

export default useUpdateKbFile
