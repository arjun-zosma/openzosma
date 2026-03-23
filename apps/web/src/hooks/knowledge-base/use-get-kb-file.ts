import knowledgeBaseService from "@/src/services/knowledge-base.services"
import { QUERY_KEYS } from "@/src/utils/query-keys"
import { useQuery } from "@tanstack/react-query"

const useGetKbFile = (path: string | null) => {
	return useQuery({
		queryKey: [QUERY_KEYS.KB_FILE, path],
		queryFn: () => knowledgeBaseService.getFile(path!),
		enabled: path !== null,
	})
}

export default useGetKbFile
