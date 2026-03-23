/** Configuration for the memory bootstrap */
export interface MemoryConfig {
	/** Root workspace directory for the agent pod (e.g. /home/agent) */
	workspaceDir: string
	/** Override PI_MEMORY_DIR (default: <workspaceDir>/.pi/agent/memory) */
	memoryDir?: string
	/** Override qmd update mode: background | manual | off */
	qmdUpdateMode?: "background" | "manual" | "off"
	/** Disable selective memory injection (for A/B testing) */
	disableSearch?: boolean
}

/** Result of bootstrapping the memory extensions */
export interface MemoryBootstrapResult {
	/** Extension file paths to pass to DefaultResourceLoader.additionalExtensionPaths */
	paths: string[]
	/** The resolved memory directory */
	memoryDir: string
}
