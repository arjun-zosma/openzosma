import { ApiService } from "."

export interface KBFile {
	id: string
	name: string
	type: "file" | "folder"
	parentId?: string | null
	children?: KBFile[]
}

export interface CreateFilePayload {
	path: string
	content?: string
}

export interface UpdateFilePayload {
	path: string
	content: string
}

export interface CreateFolderPayload {
	path: string
}

export interface RenamePayload {
	oldPath: string
	newPath: string
}

export class KnowledgeBaseService {
	private apiService: ApiService

	constructor() {
		this.apiService = new ApiService()
	}

	async getTree(): Promise<KBFile[]> {
		const { data } = await this.apiService.get<KBFile[]>("/api/knowledge-base")
		return data ?? []
	}

	async getFile(path: string): Promise<string> {
		const { data } = await this.apiService.get<{ content: string }>(
			`/api/knowledge-base/file?path=${encodeURIComponent(path)}`,
		)
		return data?.content ?? ""
	}

	async createFile(payload: CreateFilePayload): Promise<void> {
		await this.apiService.post("/api/knowledge-base/file", payload)
	}

	async updateFile(payload: UpdateFilePayload): Promise<void> {
		await this.apiService.put("/api/knowledge-base/file", payload)
	}

	async deleteFile(path: string): Promise<void> {
		await this.apiService.delete(`/api/knowledge-base/file?path=${encodeURIComponent(path)}`)
	}

	async createFolder(payload: CreateFolderPayload): Promise<void> {
		await this.apiService.post("/api/knowledge-base/folder", payload)
	}

	async deleteFolder(path: string): Promise<void> {
		await this.apiService.delete(`/api/knowledge-base/folder?path=${encodeURIComponent(path)}`)
	}

	async rename(payload: RenamePayload): Promise<void> {
		await this.apiService.fetchData("/api/knowledge-base/rename", {
			method: "PATCH",
			body: JSON.stringify(payload),
			headers: { "Content-Type": "application/json" },
		})
	}
}

const knowledgeBaseService = new KnowledgeBaseService()

export default knowledgeBaseService
