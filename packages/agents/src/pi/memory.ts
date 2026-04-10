/**
 * LLM-based fact extraction for agent memory.
 *
 * After each conversation turn, we ask the active model to extract memorable
 * facts from the exchange and return them as ExtractedFact objects for ingestion
 * into the zosma-mem bridge. Extension path resolution lives in @openzosma/zosma-mem.
 */

import { completeSimple } from "@mariozechner/pi-ai"
import type { Api, Model } from "@mariozechner/pi-ai"
import { createLogger } from "@openzosma/logger"
import type { ExtractedFact } from "@openzosma/zosma-mem/bridge"

const log = createLogger({ component: "zosma-mem" })

const EXTRACTION_SYSTEM_PROMPT = `You are extracting user preferences and facts from conversations for long-term memory.

CRITICAL RULES:
1. Extract EVERY user preference as a separate fact, even if they seem related
2. "Favorite X" and "love/like Y" are ALWAYS separate facts, even if both are animals
3. Personal statements like "I love X" or "My favorite is Y" become facts
4. Each fact must be self-contained and specific
5. Tags MUST include semantic action words like "like", "love", "hate", "favorite", "prefer"
   so the fact can be retrieved by queries like "what do I like?" or "whom do I like?"

EXAMPLES:
- User says "My favorite animal is elephant" → content: "User's favorite animal is elephant", tags: ["animal", "favorite", "elephant"]
- User says "I love the lion" → content: "User loves lions", tags: ["animal", "love", "lion"]
- User says "I hate snakes" → content: "User hates snakes", tags: ["animal", "hate", "snake"]
- User says "I like Messi" → content: "User likes Messi", tags: ["messi", "like", "football", "person"]

Extract as JSON array with:
- "content": third-person statement (e.g. "User's favorite animal is elephant")
- "type": "preference"
- "tags": array of lowercase keywords INCLUDING the relationship word (like/love/hate/favorite/prefer)

Return [] if nothing memorable. ONLY return the raw JSON array, no markdown formatting.`

/**
 * Use the active LLM to extract memorable facts from a single conversation turn.
 * Returns an empty array on any error — this is a non-critical background path.
 */
export const extractFacts = async (
	model: Model<Api>,
	apiKey: string,
	userMessage: string,
	assistantResponse: string,
): Promise<ExtractedFact[]> => {
	if (!userMessage.trim() || !assistantResponse.trim()) {
		return []
	}

	const prompt = `User: ${userMessage}\n\nAssistant: ${assistantResponse}`

	try {
		const result = await completeSimple(
			model,
			{
				systemPrompt: EXTRACTION_SYSTEM_PROMPT,
				messages: [{ role: "user", content: prompt, timestamp: Date.now() }],
			},
			{ apiKey, maxTokens: 512 },
		)

		const text = result.content
			.filter((c): c is { type: "text"; text: string } => c.type === "text")
			.map((c) => c.text)
			.join("")
			.trim()

		if (!text) {
			log.warn("LLM returned empty text")
			return []
		}

		// Strip markdown code fences that some models wrap around JSON output.
		const stripped = text
			.replace(/^```(?:json)?\s*/i, "")
			.replace(/\s*```$/, "")
			.trim()

		let parsed: unknown
		try {
			parsed = JSON.parse(stripped)
		} catch (parseErr) {
			log.warn("JSON parse failed", { error: parseErr, rawText: stripped.slice(0, 200) })
			return []
		}

		if (!Array.isArray(parsed)) {
			log.warn("LLM returned non-array", { type: typeof parsed })
			return []
		}

		const validFacts = parsed.filter(
			(item): item is ExtractedFact =>
				typeof item === "object" &&
				item !== null &&
				typeof (item as Record<string, unknown>).content === "string" &&
				["preference", "decision", "pattern", "error"].includes((item as Record<string, unknown>).type as string) &&
				Array.isArray((item as Record<string, unknown>).tags),
		)

		log.info("Extracted facts", { extracted: validFacts.length, total: parsed.length })
		return validFacts
	} catch (err) {
		log.error("LLM call failed", { error: err instanceof Error ? err.message : String(err) })
		return []
	}
}
