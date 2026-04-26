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

import { readFileSync, unlinkSync, writeFileSync } from "node:fs"
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

async function bundleEntry(entry, outName, { shebang = true } = {}) {
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

	if (shebang) {
		const outPath = resolve(outDir, outName)
		const content = readFileSync(outPath, "utf-8")
		writeFileSync(outPath, `#!/usr/bin/env node\n${content}`, { mode: 0o755 })
	}
}

async function main() {
	await bundleEntry("cli.ts", "cli.js")
	await bundleEntry("index.ts", "index.js")
	await bundleEntry("server.ts", "server.js", { shebang: false })

	// Remove internal session-manager outputs that reference unpublished workspace packages.
	// session-manager is bundled into server.js/index.js and not part of the public API.
	const toRemove = ["session-manager.d.ts", "session-manager.d.ts.map", "session-manager.js", "session-manager.js.map"]
	for (const file of toRemove) {
		try {
			unlinkSync(resolve(outDir, file))
			console.log(`   🧹 Removed ${file}`)
		} catch {
			/* ignore if already absent */
		}
	}

	console.log(`\n✅ Bundles created in ${outDir}`)
	console.log(`   External deps: ${EXTERNAL.join(", ")}`)
}

main().catch((err) => {
	console.error("❌ Bundle failed:", err)
	process.exit(1)
})
