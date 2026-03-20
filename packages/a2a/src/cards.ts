import type { Pool } from "@openzosma/db"
import type { AgentConfig } from "@openzosma/db"
import { agentConfigQueries, settingQueries } from "@openzosma/db"
import type { AgentCard, AgentSkill } from "a2a-js"
import { SKILL_METADATA } from "./skills.js"

export async function buildAgentCardForConfig(
	pool: Pool,
	config: AgentConfig,
): Promise<AgentCard> {
	const publicUrl = await settingQueries.getSettingValue<string>(pool, "public_url")
	const base = publicUrl ?? process.env["PUBLIC_URL"] ?? "http://localhost:4000"

	const skills: AgentSkill[] = config.skills.map((id) => ({
		id,
		name: SKILL_METADATA[id]?.name ?? id,
		description: SKILL_METADATA[id]?.description ?? null,
	}))

	return {
		name: config.name,
		description: config.description ?? `Agent: ${config.name}`,
		url: `${base}/a2a/agents/${config.id}`,
		version: "1.0.0",
		capabilities: {
			streaming: true,
			pushNotifications: false,
			stateTransitionHistory: true,
		},
		skills,
		authentication: { schemes: ["bearer"] },
	}
}

export async function buildAllAgentCards(pool: Pool): Promise<AgentCard[]> {
	const configs = await agentConfigQueries.listAgentConfigs(pool)
	return Promise.all(configs.map((c) => buildAgentCardForConfig(pool, c)))
}

export async function buildDefaultAgentCard(pool: Pool): Promise<AgentCard | null> {
	const configs = await agentConfigQueries.listAgentConfigs(pool)
	if (configs.length === 0) return null
	return buildAgentCardForConfig(pool, configs[0])
}
