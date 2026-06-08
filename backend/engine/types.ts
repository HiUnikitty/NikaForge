// NikaForge Backend - Shared Types
// Simplified from Claude Code's Tool.ts (~793 lines → ~60 lines)

export interface ToolInput {
  [key: string]: unknown;
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string; description?: string; enum?: string[] }>;
    required?: string[];
  };
}

export interface Tool extends ToolDefinition {
  call(input: ToolInput, context: ToolContext): Promise<ToolResult>;
}

export interface ToolContext {
  cwd: string;
  abortSignal?: AbortSignal;
  /** Track files that have been read (for FileEdit staleness check) */
  readFileState: Map<string, { content: string; timestamp: number }>;
  /** File history for rewind */
  fileHistory: Map<string, { content: string; timestamp: number }[]>;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  reasoning_content?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ServerConfig {
  port: number;
  cwd: string;
  apiUrl?: string;
  apiKey?: string;
  model?: string;
}
