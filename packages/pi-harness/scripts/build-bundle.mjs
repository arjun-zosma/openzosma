#!/usr/bin/env node
/**
 * Build self-contained bundles for the pi-harness CLI and server.
 *
 * This bundles all workspace-local code (@openzosma/*) into the output
 * while keeping external npm packages as regular dependencies. Dynamic
 * imports create separate chunks so lightweight commands (help, version,
 * status) don't trigger resolution of heavy deps like pi-coding-agent.
 *
 * Usage:
 *   node scripts/build-bundle.mjs
 */

import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import * as esbuild from "esbuild"

const __dirname = fileURLToPath(new URL(".", import.meta.url))
const outDir = resolve(__dirname, "../dist")

// External packages — these remain as npm dependencies
const EXTERNAL = [
	"hono",
	"@hono/*",
	"chalk",
	"@mariozechner/*",
	"dotenv",
	"uuid",
	"pg",
	"@sinclair/typebox",
	"@types/pg",
	"fsevents",
	"*.node",
]

async function bundleEntry(entry, outName) {
	console.log(`📦 Bundling ${entry}...`)
	await esbuild.build({
		entryPoints: [resolve(__dirname, `../src/${entry}`)],
		bundle: true,
		platform: "node",
		format: "esm",
		target: "node22",
		outdir: outDir,
		splitting: true,
		external: EXTERNAL,
		minify: false,
		sourcemap: true,
	})

	// Prepend shebang
	const outPath = resolve(outDir, outName)
	const content = readFileSync(outPath, "utf-8")
	writeFileSync(outPath, `#!/usr/bin/env node\n${content}`, { mode: 0o755 })
}

async function main() {
	await bundleEntry("cli.ts", "cli.js")
	await bundleEntry("index.ts", "index.js")

	console.log(`\n✅ Bundles created in ${outDir}`)
	console.log(`   External deps: ${EXTERNAL.join(", ")}`)
}

main().catch((err) => {
	console.error("❌ Bundle failed:", err)
	process.exit(1)
})
