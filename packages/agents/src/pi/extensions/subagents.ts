import { Dirent, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { SUBAGENTS_CONFIG } from "../config.js";
import type { SubagentsExtensionConfig } from "../extension-types.js";

export function getSubagentsConfigPath(): string {
  return join(homedir(), ".pi", "agent", "extensions", "subagent", "config.json");
}

export function syncSubagentsConfig(config: SubagentsExtensionConfig = SUBAGENTS_CONFIG): string {
  const configPath = getSubagentsConfigPath();
  mkdirSync(dirname(configPath), { recursive: true });
  const payload = {
    asyncByDefault: config.asyncByDefault,
    defaultSessionDir: config.sessionDir,
  };
  writeFileSync(configPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  return configPath;
}

export function applySubagentEnv(config: SubagentsExtensionConfig = SUBAGENTS_CONFIG): void {
  if (config.maxDepth !== undefined && !process.env.PI_SUBAGENT_MAX_DEPTH) {
    process.env.PI_SUBAGENT_MAX_DEPTH = String(config.maxDepth);
  }
}

export function isPiAvailable(): boolean {
  const result = spawnSync("pi", ["--version"], { encoding: "utf-8" });
  return result.status === 0 && /\d+\.\d+/.test(result.stdout ?? "");
}

const SUBAGENTS_SOURCE_DIR = join(dirname(fileURLToPath(import.meta.url)), "../subagents");
const SUBAGENTS_TARGET_DIR = join(homedir(), ".pi", "agent", "agents");

export function syncSubagentDefinitions(): string[] {
  let entries: Dirent[];
  try {
    entries = readdirSync(SUBAGENTS_SOURCE_DIR, { withFileTypes: true });
  } catch {
    return [];
  }

  mkdirSync(SUBAGENTS_TARGET_DIR, { recursive: true });

  const synced: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const src = join(SUBAGENTS_SOURCE_DIR, entry.name);
    const dest = join(SUBAGENTS_TARGET_DIR, entry.name);
    writeFileSync(dest, readFileSync(src, "utf-8"), "utf-8");
    synced.push(dest);
  }
  return synced;
}
