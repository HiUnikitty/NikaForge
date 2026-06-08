// NikaForge Backend - GrepTool
// Ported from Claude Code's tools/GrepTool/

import { spawn } from 'child_process';
import { resolve } from 'path';
import { readdir, readFile, stat } from 'fs/promises';
import type { Tool, ToolInput, ToolResult, ToolContext } from '../engine/types';

/**
 * Pure JS grep fallback (when ripgrep is not available)
 */
async function jsGrep(
  pattern: string,
  searchPath: string,
  options: { caseInsensitive?: boolean; glob?: string; contextLines?: number }
): Promise<string> {
  const results: string[] = [];
  const flags = options.caseInsensitive ? 'gi' : 'g';
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, flags);
  } catch {
    regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
  }

  // 1. 判断是具体文件还是目录，若是文件，则直接进行单文件匹配，免去 readdir
  let isFile = false;
  try {
    const stats = await stat(searchPath);
    isFile = stats.isFile();
  } catch {
    return 'No matches found.';
  }

  if (isFile) {
    try {
      const content = await readFile(searchPath, 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i]!)) {
          results.push(`${searchPath}:${i + 1}: ${lines[i]}`);
        }
      }
    } catch { }
    return results.join('\n') || 'No matches found.';
  }

  // 2. 如果是目录，递归扫描搜索
  async function searchDir(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = resolve(dir, entry.name);
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

      if (entry.isDirectory()) {
        await searchDir(fullPath);
      } else if (entry.isFile()) {
        // Check glob pattern
        if (options.glob) {
          const globRegex = new RegExp(
            '^' + options.glob.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
          );
          if (!globRegex.test(entry.name)) continue;
        }

        try {
          const content = await readFile(fullPath, 'utf-8');
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i]!)) {
              results.push(`${fullPath}:${i + 1}: ${lines[i]}`);
              if (results.length >= 250) return;
            }
          }
        } catch {
          // Skip binary/unreadable files
        }
      }
    }
  }

  await searchDir(searchPath);
  return results.join('\n') || 'No matches found.';
}

export const GrepTool: Tool = {
  name: 'Grep',
  description: 'Searches for a pattern in files using regex. Returns matching lines with file paths and line numbers.',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Regex pattern to search for' },
      path: { type: 'string', description: 'Directory or file to search in (default: cwd)' },
      glob: { type: 'string', description: 'Glob pattern to filter files (e.g., "*.ts", "*.json")' },
      case_insensitive: { type: 'string', description: 'Set to "true" for case-insensitive search' },
    },
    required: ['pattern'],
  },

  async call(input: ToolInput, context: ToolContext): Promise<ToolResult> {
    const pattern = input.pattern as string;
    const searchPath = resolve(context.cwd, (input.path as string) || '.');
    const caseInsensitive = input.case_insensitive === true || input.case_insensitive === 'true';
    const glob = input.glob as string | undefined;

    try {
      // Try ripgrep first (much faster)
      const rgResult = await tryRipgrep(pattern, searchPath, { caseInsensitive, glob });
      if (rgResult !== null) {
        return { success: true, output: rgResult || 'No matches found.' };
      }
    } catch {
      // ripgrep not available, fall through to JS implementation
    }

    // Fallback to JS grep
    try {
      const result = await jsGrep(pattern, searchPath, {
        caseInsensitive,
        glob,
      });
      return { success: true, output: result };
    } catch (err: any) {
      return { success: false, output: '', error: err.message };
    }
  },
};

function tryRipgrep(
  pattern: string,
  searchPath: string,
  options: { caseInsensitive?: boolean; glob?: string }
): Promise<string | null> {
  return new Promise((resolve) => {
    const args = ['--line-number', '--no-heading', '--max-count=250', pattern];
    if (options.caseInsensitive) args.push('-i');
    if (options.glob) args.push('--glob', options.glob);
    args.push(searchPath);

    const child = spawn('rg', args, { timeout: 30000 });
    let output = '';
    let hasError = false;

    child.stdout?.on('data', (data: Buffer) => { output += data.toString(); });
    child.stderr?.on('data', () => { hasError = true; });
    child.on('error', () => resolve(null)); // rg not found
    child.on('close', (code) => {
      if (hasError && !output) resolve(null);
      else resolve(output.trim());
    });
  });
}
