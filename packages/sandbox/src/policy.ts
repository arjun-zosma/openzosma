import type { NetworkEndpoint, NetworkPolicyRule, SandboxPolicy } from "./types.js"

/**
 * LLM provider API hosts and their typical endpoints.
 */
const PROVIDER_HOSTS: Record<string, { host: string; paths?: string[] }> = {
	anthropic: { host: "api.anthropic.com", paths: ["/v1/messages"] },
	openai: { host: "api.openai.com", paths: ["/v1/chat/completions", "/v1/embeddings", "/v1/models"] },
	google: { host: "generativelanguage.googleapis.com" },
	groq: { host: "api.groq.com", paths: ["/openai/v1/chat/completions"] },
	xai: { host: "api.x.ai", paths: ["/v1/chat/completions"] },
	mistral: { host: "api.mistral.ai", paths: ["/v1/chat/completions"] },
	nvidia: { host: "integrate.api.nvidia.com" },
}

/**
 * Build a SandboxPolicy object from a simplified configuration.
 *
 * The returned object can be serialized to YAML and written to a policy file.
 */
export function buildPolicy(opts?: {
	/** LLM providers the agent is allowed to reach (e.g. ["anthropic", "openai"]). */
	allowedProviders?: string[]
	/** Additional network endpoints to allow. */
	additionalEndpoints?: NetworkPolicyRule[]
	/** Extra filesystem paths to make writable. */
	extraWritePaths?: string[]
}): SandboxPolicy {
	const allowedProviders = opts?.allowedProviders ?? Object.keys(PROVIDER_HOSTS)

	// Build LLM provider network rules
	const llmEndpoints: NetworkEndpoint[] = allowedProviders
		.filter((p) => p in PROVIDER_HOSTS)
		.map((p) => {
			const def = PROVIDER_HOSTS[p]
			return {
				host: def.host,
				port: 443,
				protocol: "rest" as const,
				tls: "passthrough" as const,
				enforcement: "enforce" as const,
				...(def.paths ? { methods: ["POST", "GET"], paths: def.paths } : {}),
			}
		})

	const networkPolicies: Record<string, NetworkPolicyRule> = {}

	if (llmEndpoints.length > 0) {
		networkPolicies.llm_providers = {
			name: "llm_providers",
			endpoints: llmEndpoints,
			binaries: ["/usr/local/bin/node"],
		}
	}

	// npm registry access
	networkPolicies.npm_registry = {
		name: "npm_registry",
		endpoints: [
			{
				host: "registry.npmjs.org",
				port: 443,
				protocol: "rest",
				tls: "passthrough",
				enforcement: "enforce",
			},
		],
		binaries: ["/usr/local/bin/node", "/usr/local/bin/npm", "/usr/local/bin/npx"],
	}

	// PyPI access
	networkPolicies.pypi = {
		name: "pypi",
		endpoints: [
			{ host: "pypi.org", port: 443, tls: "passthrough", enforcement: "enforce" },
			{ host: "files.pythonhosted.org", port: 443, tls: "passthrough", enforcement: "enforce" },
		],
		binaries: ["/usr/bin/python3", "/usr/bin/pip3"],
	}

	// GitHub access
	networkPolicies.github = {
		name: "github",
		endpoints: [
			{ host: "github.com", port: 443, tls: "passthrough", enforcement: "enforce" },
			{ host: "api.github.com", port: 443, tls: "passthrough", enforcement: "enforce" },
		],
		binaries: ["/usr/bin/git", "/usr/local/bin/node"],
	}

	// Merge additional rules
	if (opts?.additionalEndpoints) {
		for (const rule of opts.additionalEndpoints) {
			networkPolicies[rule.name] = rule
		}
	}

	const extraWrite = opts?.extraWritePaths ?? []

	return {
		filesystem: {
			readOnly: ["/usr", "/lib", "/lib64", "/proc", "/dev/urandom", "/app", "/etc"],
			readWrite: ["/workspace", "/tmp", "/dev/null", ...extraWrite],
		},
		landlock: {
			compatibility: "best_effort",
		},
		process: {
			runAsUser: "sandbox",
			runAsGroup: "sandbox",
		},
		networkPolicies,
	}
}

/**
 * Serialize a SandboxPolicy to YAML string for the OpenShell policy file.
 *
 * Uses a minimal YAML serializer to avoid adding a yaml dependency to this package.
 * The output matches the structure expected by `openshell sandbox create --policy <file>`.
 */
export function policyToYaml(policy: SandboxPolicy): string {
	const lines: string[] = []

	lines.push("filesystem:")
	lines.push("  read_only:")
	for (const p of policy.filesystem.readOnly) {
		lines.push(`    - "${p}"`)
	}
	lines.push("  read_write:")
	for (const p of policy.filesystem.readWrite) {
		lines.push(`    - "${p}"`)
	}

	lines.push("")
	lines.push("landlock:")
	lines.push(`  compatibility: ${policy.landlock.compatibility}`)

	lines.push("")
	lines.push("process:")
	lines.push(`  run_as_user: ${policy.process.runAsUser}`)
	lines.push(`  run_as_group: ${policy.process.runAsGroup}`)

	lines.push("")
	lines.push("network_policies:")
	for (const [key, rule] of Object.entries(policy.networkPolicies)) {
		lines.push(`  ${key}:`)
		lines.push(`    name: ${rule.name}`)
		lines.push("    endpoints:")
		for (const ep of rule.endpoints) {
			lines.push(`      - host: "${ep.host}"`)
			if (ep.port !== undefined) lines.push(`        port: ${ep.port}`)
			if (ep.protocol) lines.push(`        protocol: ${ep.protocol}`)
			if (ep.tls) lines.push(`        tls: ${ep.tls}`)
			if (ep.enforcement) lines.push(`        enforcement: ${ep.enforcement}`)
			if (ep.methods && ep.methods.length > 0) {
				const methodList = ep.methods.map((m) => `"${m}"`).join(", ")
				lines.push(`        methods: [${methodList}]`)
			}
			if (ep.paths && ep.paths.length > 0) {
				const pathList = ep.paths.map((p) => `"${p}"`).join(", ")
				lines.push(`        paths: [${pathList}]`)
			}
		}
		if (rule.binaries && rule.binaries.length > 0) {
			lines.push("    binaries:")
			for (const bin of rule.binaries) {
				lines.push(`      - path: "${bin}"`)
			}
		}
	}

	return `${lines.join("\n")}\n`
}
