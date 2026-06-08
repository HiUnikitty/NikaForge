// NikaForge Backend - BashTool
// Ported from Claude Code's tools/BashTool/BashTool.tsx (160KB → ~80 lines core)
// Strips: React UI, permission system, security rules, sandbox logic

import { spawn } from 'child_process';
import { resolve } from 'path';
import type { Tool, ToolInput, ToolResult, ToolContext } from '../engine/types';

const TIMEOUT_MS = 120_000; // 2 minutes default

export const BashTool: Tool = {
  name: 'Bash',
  description: 'Executes a shell command in the working directory. Use this for running scripts, installing packages, git operations, file manipulation, and any system command.',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The shell command to execute' },
      timeout: { type: 'number', description: 'Timeout in milliseconds (default: 120000)' },
    },
    required: ['command'],
  },

  async call(input: ToolInput, context: ToolContext): Promise<ToolResult> {
    const command = input.command as string;
    const timeout = (input.timeout as number) || TIMEOUT_MS;
    const cwd = resolve(context.cwd);

    return new Promise((resolvePromise) => {
      let stdout = '';
      let stderr = '';
      let killed = false;

      // Use node's shell option to execute the command correctly on all platforms (handling quotes/escaping on Windows)
      const child = spawn(command, [], {
        cwd,
        env: { ...process.env, PAGER: 'cat' },
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const timer = setTimeout(() => {
        killed = true;
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 5000);
      }, timeout);

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
        // Safety cap: 1MB output limit
        if (stdout.length > 1_000_000) {
          stdout = stdout.slice(0, 1_000_000) + '\n... (output truncated at 1MB)';
          child.kill('SIGTERM');
        }
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        const output = (stdout + (stderr ? `\nSTDERR:\n${stderr}` : '')).trim();

        if (killed) {
          resolvePromise({
            success: false,
            output: output || '(no output)',
            error: `Command timed out after ${timeout}ms`,
          });
        } else {
          resolvePromise({
            success: code === 0,
            output: output || '(no output)',
            error: code !== 0 ? `Exit code: ${code}` : undefined,
          });
        }
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        resolvePromise({
          success: false,
          output: '',
          error: `Failed to spawn: ${err.message}`,
        });
      });

      // Wire abort signal
      if (context.abortSignal) {
        context.abortSignal.addEventListener('abort', () => {
          child.kill('SIGTERM');
        });
      }
    });
  },
};
