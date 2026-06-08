// NikaForge Backend - GlobTool
// Ported from Claude Code's tools/GlobTool/

import { readdir, stat } from 'fs/promises';
import { resolve, relative } from 'path';
import type { Tool, ToolInput, ToolResult, ToolContext } from '../engine/types';

/**
 * Simple glob matching (supports * and **)
 */
function matchGlob(pattern: string, filePath: string): boolean {
  const regexStr = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/\\\\]*')
    .replace(/\?/g, '.')
    .replace(/{{GLOBSTAR}}/g, '.*');
  return new RegExp(`^${regexStr}$`).test(filePath.replace(/\\/g, '/'));
}

async function walkDir(
  dir: string,
  baseDir: string,
  results: string[],
  maxResults: number,
  pattern?: string
): Promise<void> {
  if (results.length >= maxResults) return;
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (results.length >= maxResults) break;
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

      const fullPath = resolve(dir, entry.name);
      const relPath = relative(baseDir, fullPath);

      if (entry.isDirectory()) {
        await walkDir(fullPath, baseDir, results, maxResults, pattern);
      } else if (entry.isFile()) {
        if (!pattern || matchGlob(pattern, relPath)) {
          results.push(relPath);
        }
      }
    }
  } catch {
    // Permission denied or similar, skip
  }
}

export const GlobTool: Tool = {
  name: 'Glob',
  description: 'Lists files matching a glob pattern. Use ** for recursive matching. Returns relative file paths.',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Glob pattern (e.g., "**/*.ts", "src/**/*.json")' },
      path: { type: 'string', description: 'Base directory to search in (default: cwd)' },
    },
    required: ['pattern'],
  },

  async call(input: ToolInput, context: ToolContext): Promise<ToolResult> {
    const pattern = input.pattern as string;
    const searchPath = resolve(context.cwd, (input.path as string) || '.');
    const results: string[] = [];

    try {
      await walkDir(searchPath, searchPath, results, 500, pattern);
      results.sort();

      if (results.length === 0) {
        return { success: true, output: `No files matching pattern: ${pattern}` };
      }

      return {
        success: true,
        output: `Found ${results.length} file(s):\n${results.join('\n')}`,
      };
    } catch (err: any) {
      return { success: false, output: '', error: err.message };
    }
  },
};
