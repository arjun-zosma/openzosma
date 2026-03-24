// ---------------------------------------------------------------------------
// OpenShell sandbox types
// ---------------------------------------------------------------------------

/** Phase of a sandbox in its lifecycle. */
export type SandboxPhase =
	| "creating"
	| "provisioning"
	| "ready"
	| "suspended"
	| "error"
	| "deleting"
	| "deleted"
	| "unknown"

/** Information about a running or pending sandbox. */
export interface SandboxInfo {
	/** Sandbox name (e.g. "user-abc123"). */
	name: string
	/** Current lifecycle phase. */
	phase: SandboxPhase
	/** Container image used. */
	image?: string
	/** Namespace in the K3s cluster. */
	namespace?: string
	/** Internal pod IP (when ready). */
	podIp?: string
	/** ISO timestamp of creation. */
	createdAt?: string
}

/** Result of executing a command inside a sandbox. */
export interface ExecResult {
	/** Process exit code. */
	exitCode: number
	/** Combined stdout. */
	stdout: string
	/** Combined stderr. */
	stderr: string
}

/** Options for executing a command in a sandbox. */
export interface ExecOptions {
	/** Working directory inside the sandbox. */
	workdir?: string
	/** Environment variables to inject. */
	env?: Record<string, string>
	/** Timeout in milliseconds. */
	timeoutMs?: number
	/** Data to pipe to stdin. */
	stdin?: string
}

// ---------------------------------------------------------------------------
// Sandbox configuration
// ---------------------------------------------------------------------------

/** Configuration for creating a new sandbox. */
export interface SandboxConfig {
	/** Container image to use. */
	image: string
	/** Path to a YAML policy file on the host. */
	policyPath?: string
	/** Environment variables injected into the sandbox via .env upload. */
	env?: Record<string, string>
	/** Whether the sandbox should have GPU access. */
	gpu?: boolean
	/** Port the agent server listens on inside the sandbox. */
	agentPort?: number
	/**
	 * Command to run inside the sandbox (passed after `--`).
	 * If not set, the sandbox runs `sleep infinity` by default.
	 * Example: `["/entrypoint.sh"]`
	 */
	command?: string[]
}

// ---------------------------------------------------------------------------
// Sandbox policy types (maps to OpenShell policy YAML)
// ---------------------------------------------------------------------------

export interface FilesystemPolicy {
	readOnly: string[]
	readWrite: string[]
}

export interface NetworkEndpoint {
	host: string
	port?: number
	protocol?: "rest" | "sql" | "L4"
	tls?: "terminate" | "passthrough"
	enforcement?: "enforce" | "audit"
	methods?: string[]
	paths?: string[]
}

export interface NetworkPolicyRule {
	name: string
	endpoints: NetworkEndpoint[]
	binaries?: string[]
}

export interface ProcessPolicy {
	runAsUser: string
	runAsGroup: string
}

export interface LandlockPolicy {
	compatibility: "best_effort" | "strict"
}

export interface SandboxPolicy {
	filesystem: FilesystemPolicy
	landlock: LandlockPolicy
	process: ProcessPolicy
	networkPolicies: Record<string, NetworkPolicyRule>
}

// ---------------------------------------------------------------------------
// User sandbox record (stored in PostgreSQL)
// ---------------------------------------------------------------------------

export interface UserSandbox {
	id: string
	userId: string
	sandboxName: string
	status: SandboxPhase
	policyTemplate: string
	createdAt: Date
	lastActiveAt: Date
	suspendedAt: Date | null
	metadata: Record<string, unknown>
}
