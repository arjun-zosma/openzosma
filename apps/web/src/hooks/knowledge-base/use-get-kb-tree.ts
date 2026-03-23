import knowledgeBaseService from "@/src/services/knowledge-base.services"
import { QUERY_KEYS } from "@/src/utils/query-keys"
import { useQuery } from "@tanstack/react-query"

const useGetKbTree = () => {
	return useQuery({
		queryKey: [QUERY_KEYS.KB_TREE],
		queryFn: () => knowledgeBaseService.getTree(),
	})
}

export default useGetKbTree
