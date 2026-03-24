import {
	createBashTool,
	createEditTool,
	createFindTool,
	createGrepTool,
	createLsTool,
	createReadTool,
	createWriteTool,
} from "@mariozechner/pi-coding-agent"

export type BuiltInToolName = "read" | "bash" | "edit" | "write" | "grep" | "find" | "ls"

export const createDefaultTools = (workspaceDir: string, toolsEnabled?: string[]) => {
	const allTools = [
		{ name: "read", tool: createReadTool(workspaceDir) },
		{ name: "bash", tool: createBashTool(workspaceDir) },
		{ name: "edit", tool: createEditTool(workspaceDir) },
		{ name: "write", tool: createWriteTool(workspaceDir) },
		{ name: "grep", tool: createGrepTool(workspaceDir) },
		{ name: "find", tool: createFindTool(workspaceDir) },
		{ name: "ls", tool: createLsTool(workspaceDir) },
	] as const

	if (!toolsEnabled || toolsEnabled.length === 0) {
		return allTools.map((t) => t.tool)
	}

	const allow = new Set(toolsEnabled)
	return allTools.filter((t) => allow.has(t.name)).map((t) => t.tool)
}
