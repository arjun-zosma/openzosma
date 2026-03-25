"use client"

import useGetConversation from "@/src/hooks/chat/use-get-conversation"
import { useMemo } from "react"
import type { FileArtifact } from "../types"

/**
 * Aggregates artifacts from two sources:
 * 1. Real-time: artifacts accumulated from file_output events during streaming
 * 2. Persisted: message attachments with type "artifact" from conversation data
 *
 * Deduplicates by filename, preferring the streaming version (more recent).
 */
const useSessionArtifacts = (
	conversationid: string,
	streamingartifacts: FileArtifact[],
): {
	artifacts: FileArtifact[]
	hasfiles: boolean
	loading: boolean
} => {
	const { data, isLoading } = useGetConversation(conversationid)

	const artifacts = useMemo(() => {
		const seen = new Map<string, FileArtifact>()

		// First add persisted artifacts from DB
		if (data?.messages) {
			for (const msg of data.messages) {
				if (!msg.attachments) continue
				for (const att of msg.attachments) {
					if (att.type === "artifact" && att.filename) {
						seen.set(att.filename, {
							filename: att.filename,
							mediatype: att.mediatype ?? "application/octet-stream",
							sizebytes: att.sizebytes ?? 0,
						})
					}
				}
			}
		}

		// Then overlay streaming artifacts (latest wins)
		for (const artifact of streamingartifacts) {
			seen.set(artifact.filename, artifact)
		}

		return Array.from(seen.values())
	}, [data?.messages, streamingartifacts])

	return {
		artifacts,
		hasfiles: artifacts.length > 0,
		loading: isLoading,
	}
}

export default useSessionArtifacts
