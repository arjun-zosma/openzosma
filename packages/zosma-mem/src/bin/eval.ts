import { intro, note, outro, spinner, text } from "@clack/prompts"
import { createLogger } from "@openzosma/logger"
import chalk from "chalk"
import { Command } from "commander"
import { createMemoryBridge, factId } from "../bridge/index.js"
import { evaluateMemory } from "../evals/index.js"
import type { MemoryEventType } from "../types.js"

interface SQuADAnswer {
	text: string
	answer_start: number
}

interface SQuADQA {
	question: string
	answers: SQuADAnswer[]
}

interface SQuADParagraph {
	context: string
	qas: SQuADQA[]
}

interface SQuADArticle {
	title: string
	paragraphs: SQuADParagraph[]
}

interface SQuADData {
	data: SQuADArticle[]
}

const logger = createLogger({ component: "zosma-mem-eval" })

const program = new Command()

program.name("zosma-mem-eval").description("CLI tool to evaluate memory retrieval effectiveness").version("0.0.1")

program
	.command("run")
	.description("Run interactive memory evaluation")
	.action(async () => {
		try {
			intro(chalk.blue("🧠 Zosma Memory Evaluation"))

			// Prompt for number of test cases
			const result = await text({ message: "How many test cases to run?", defaultValue: "10" })
			if (typeof result === "symbol") process.exit(0)
			const numCasesStr = result
			const numCases = Number.parseInt(numCasesStr || "10")

			// Use default memory dir for internal use
			const memoryDir = "../../../workspace/agents/default/memory"
			logger.info(`Using memory dir: ${memoryDir}`)

			// Create bridge
			const s = spinner()
			s.start("Initializing memory bridge...")
			const bridge = createMemoryBridge({ memoryDir })
			s.stop("Memory bridge ready!")

			// Fetch SQuAD validation dataset from Hugging Face
			const url = "https://rajpurkar.github.io/SQuAD-explorer/dataset/dev-v1.1.json"
			const response = await fetch(url)
			const data = (await response.json()) as SQuADData

			// Prepare facts and test cases
			const facts: { content: string; type: MemoryEventType; tags: string[] }[] = []
			const testCases = []
			let totalCases = 0
			for (const item of data.data) {
				if (totalCases >= numCases) break
				for (const para of item.paragraphs) {
					if (totalCases >= numCases) break
					const context = para.context
					const contextId = factId(context)
					facts.push({ content: context, type: "pattern" as MemoryEventType, tags: [] })
					for (const qa of para.qas.slice(0, 1)) {
						if (totalCases >= numCases) break
						testCases.push({
							query: qa.question,
							expectedIds: [contextId],
							expectedContent: qa.answers.map((a: SQuADAnswer) => a.text),
						})
						totalCases++
					}
				}
			}

			// Ingest facts into memory
			await bridge.ingestFacts(facts)

			logger.info(`Running ${testCases.length} real test cases from HF SQuAD...`)

			// Run evaluation
			const evalSpinner = spinner()
			evalSpinner.start("Running evaluation...")
			const results = await evaluateMemory(bridge, { testCases })
			evalSpinner.stop("Evaluation complete!")

			// Display results as table
			const table = `
| Metric              | Value                     |
|---------------------|---------------------------|
| Total Cases         | ${results.cases.length}   |
| Average Recall      | ${(results.metrics.avgRecall * 100).toFixed(2)}% |
| Average Precision   | ${(results.metrics.avgPrecision * 100).toFixed(2)}% |
| Average F1 Score    | ${(results.metrics.avgF1 * 100).toFixed(2)}% |
`

			note(table, "Evaluation Results")

			outro(chalk.green("Evaluation complete! 🎉"))
		} catch (error) {
			outro(chalk.red(`Error: ${(error as Error).message}`))
			process.exit(1)
		}
	})

program.parse()
