export interface GuardrailsPolicyRule {
  id: string;
  description?: string;
  patterns: Array<{ pattern: string; regex?: boolean }>;
  allowedPatterns?: Array<{ pattern: string; regex?: boolean }>;
  protection: "none" | "readOnly" | "noAccess";
  onlyIfExists?: boolean;
  blockMessage?: string;
  enabled?: boolean;
}

export interface GuardrailsExtensionConfig {
  enabled: boolean;
  features: {
    policies: boolean;
    permissionGate: boolean;
  };
  policies?: {
    rules?: GuardrailsPolicyRule[];
  };
  permissionGate: {
    requireConfirmation: boolean;
    explainCommands: boolean;
    explainModel: string | null;
    explainTimeout: number;
  };
}

export interface WebSearchExtensionConfig {
  provider: "auto" | "perplexity" | "gemini";
  searchModel?: string;
  curateWindow?: number;
}

export interface SubagentsExtensionConfig {
  asyncByDefault: boolean;
  maxDepth?: number;
  sessionDir?: string;
}
