/**
 * Core types for the reports skill template system.
 */

/** Supported output formats for report rendering. */
export type ReportFormat = "pdf" | "pptx" | "xlsx"

/** Options passed to a template renderer. */
export interface RenderOpts {
	/** Output format requested by the caller. */
	format: ReportFormat
	/** Absolute path where the rendered file should be written. */
	outputPath: string
}

/**
 * A report template that can render structured data into one or more formats.
 *
 * @typeParam T - The validated data shape this template accepts.
 */
export interface ReportTemplate<T> {
	/** Unique machine-readable name used to look up the template. */
	name: string
	/** Human-readable title shown in listings. */
	title: string
	/** Formats this template supports. */
	formats: ReportFormat[]
	/**
	 * Validate and parse raw input data into the typed shape T.
	 * Should throw a descriptive error on invalid input.
	 */
	parse: (raw: unknown) => T
	/**
	 * Render the report data to the requested format and write the result to outputPath.
	 * Returns the absolute path of the written file.
	 */
	render: (data: T, opts: RenderOpts) => Promise<string>
}

/** One row of session-level metrics for a monthly report. */
export interface SessionMetricRow {
	/** Session identifier. */
	sessionId: string
	/** Total number of messages in the session. */
	messageCount: number
	/** Total tool calls made during the session. */
	toolCallCount: number
	/** Session duration in seconds. */
	durationSeconds: number
}

/** Aggregated data driving a monthly report. */
export interface MonthlyReportData {
	/** Report period label, e.g. "March 2026". */
	period: string
	/** Total sessions started in the period. */
	totalSessions: number
	/** Total messages exchanged in the period. */
	totalMessages: number
	/** Total tool calls in the period. */
	totalToolCalls: number
	/** Per-session breakdown. */
	sessions: SessionMetricRow[]
}
