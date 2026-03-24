/** Base error for all sandbox operations. */
export class SandboxError extends Error {
	constructor(
		message: string,
		public readonly sandboxName?: string,
		public readonly cause?: unknown,
	) {
		super(message)
		this.name = "SandboxError"
	}
}

/** The sandbox is not in the expected phase for the requested operation. */
export class SandboxNotReadyError extends SandboxError {
	constructor(sandboxName: string, currentPhase: string) {
		super(`Sandbox "${sandboxName}" is not ready (phase: ${currentPhase})`, sandboxName)
		this.name = "SandboxNotReadyError"
	}
}

/** The sandbox was not found. */
export class SandboxNotFoundError extends SandboxError {
	constructor(sandboxName: string) {
		super(`Sandbox "${sandboxName}" not found`, sandboxName)
		this.name = "SandboxNotFoundError"
	}
}

/** A sandbox operation timed out. */
export class SandboxTimeoutError extends SandboxError {
	constructor(sandboxName: string, operation: string, timeoutMs: number) {
		super(`Sandbox "${sandboxName}" ${operation} timed out after ${timeoutMs}ms`, sandboxName)
		this.name = "SandboxTimeoutError"
	}
}

/** The openshell CLI is not available or returned an unexpected error. */
export class OpenShellCliError extends SandboxError {
	constructor(
		message: string,
		public readonly command: string,
		public readonly stderr?: string,
		public readonly exitCode?: number,
	) {
		super(message)
		this.name = "OpenShellCliError"
	}
}
