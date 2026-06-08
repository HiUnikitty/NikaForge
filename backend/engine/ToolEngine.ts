// NikaForge Backend - Tool Execution Engine
// Simplified from Claude Code's query.ts (~1730 lines) and toolOrchestration.ts

import type { Tool, ToolInput, ToolResult, ToolContext, ToolCall } from './types';

export class ToolEngine {
  private tools: Map<string, Tool> = new Map();
  private context: ToolContext;

  constructor(cwd: string) {
    this.context = {
      cwd,
      readFileState: new Map(),
      fileHistory: new Map(),
    };
  }

  registerTool(tool: Tool) {
    this.tools.set(tool.name, tool);
  }

  registerTools(tools: Tool[]) {
    for (const tool of tools) {
      this.registerTool(tool);
    }
  }

  getToolSchemas() {
    return Array.from(this.tools.values()).map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));
  }

  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  async executeTool(name: string, input: ToolInput): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        success: false,
        output: '',
        error: `Unknown tool: ${name}. Available tools: ${this.getToolNames().join(', ')}`,
      };
    }

    try {
      const result = await tool.call(input, this.context);
      return result;
    } catch (err: any) {
      return {
        success: false,
        output: '',
        error: `Tool ${name} failed: ${err.message || String(err)}`,
      };
    }
  }

  async executeToolCall(toolCall: ToolCall): Promise<ToolResult> {
    let input: ToolInput;
    try {
      input = JSON.parse(toolCall.function.arguments);
    } catch {
      return {
        success: false,
        output: '',
        error: `Invalid JSON arguments for tool ${toolCall.function.name}`,
      };
    }
    return this.executeTool(toolCall.function.name, input);
  }

  /** Get current working directory */
  getCwd(): string {
    return this.context.cwd;
  }

  /** Update cwd */
  setCwd(cwd: string) {
    this.context.cwd = cwd;
  }

  /** Snapshot all tracked files for rewind */
  snapshotFiles(label: string) {
    const snapshot: Record<string, string> = {};
    for (const [path, history] of this.context.fileHistory) {
      const latest = history[history.length - 1];
      if (latest) snapshot[path] = latest.content;
    }
    return { label, timestamp: Date.now(), files: snapshot };
  }

  /** Rewind a file to a previous state */
  rewindFile(path: string, targetTimestamp: number): ToolResult {
    const history = this.context.fileHistory.get(path);
    if (!history || history.length === 0) {
      return { success: false, output: '', error: `No history for file: ${path}` };
    }
    // Find the closest entry before or at the target timestamp
    let target = history[0]!;
    for (const entry of history) {
      if (entry.timestamp <= targetTimestamp) target = entry;
      else break;
    }
    return { success: true, output: target.content };
  }
}
