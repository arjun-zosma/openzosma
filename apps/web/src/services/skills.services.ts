import type { Skill } from "@/src/types/skills"
import { ApiService } from "."

export interface CreateSkillPayload {
	name: string
	description: string
	source: "file"
	content: string
}

export interface UpdateSkillPayload {
	name: string
	description: string
	content: string
}

export class SkillsService {
	private apiService: ApiService

	constructor() {
		this.apiService = new ApiService()
	}

	/** Fetch all skills. */
	async getSkills(): Promise<Skill[]> {
		const { data } = await this.apiService.get<{ skills: Skill[] }>("/api/skills")
		return data?.skills ?? []
	}

	/** Fetch a single skill by ID with full content. */
	async getSkill(id: string): Promise<Skill> {
		const { data } = await this.apiService.get<{ skill: Skill }>(`/api/skills/${id}`)
		return data!.skill
	}

	/** Create a new custom skill. */
	async createSkill(payload: CreateSkillPayload): Promise<void> {
		await this.apiService.post("/api/skills", payload)
	}

	/** Update an existing skill. */
	async updateSkill(id: string, payload: UpdateSkillPayload): Promise<void> {
		await this.apiService.put(`/api/skills/${id}`, payload)
	}

	/** Delete a skill by ID. */
	async deleteSkill(id: string): Promise<void> {
		await this.apiService.delete(`/api/skills/${id}`)
	}
}

const skillsService = new SkillsService()

export default skillsService
