import { execSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { createLogger } from "@openzosma/logger"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const log = createLogger({ component: "grpc" })

const protoDir = join(__dirname, "..", "..", "..", "proto")
const outDir = join(__dirname, "..", "src", "generated")

if (!existsSync(outDir)) {
	mkdirSync(outDir, { recursive: true })
}

const protoFiles = ["orchestrator.proto", "sandbox.proto"]

for (const proto of protoFiles) {
	const protoPath = join(protoDir, proto)
	log.info(`Generating TypeScript from ${proto}...`)

	execSync(`npx protoc --ts_out ${outDir} --proto_path ${protoDir} ${protoPath}`, { stdio: "inherit" })
}

// Post-process: add .js extensions to relative imports for Node16 moduleResolution
const generatedFiles = readdirSync(outDir).filter((f) => f.endsWith(".ts"))
for (const file of generatedFiles) {
	const filePath = join(outDir, file)
	let content = readFileSync(filePath, "utf-8")
	// Match relative imports without file extensions: from "./foo" -> from "./foo.js"
	content = content.replace(/(from\s+["'])(\.\.?\/[^"']+?)(?<!\.js)(["'])/g, "$1$2.js$3")
	writeFileSync(filePath, content)
}

log.info("Proto generation complete.")
