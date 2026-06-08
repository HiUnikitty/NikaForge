// NikaForge Backend - FileWriteTool
// Ported from Claude Code's tools/FileWriteTool/

import { mkdir } from 'fs/promises';
import { writeTextFile, readTextFile } from '../pngHelper';
import { resolve, dirname } from 'path';
import type { Tool, ToolInput, ToolResult, ToolContext } from '../engine/types';

export const FileWriteTool: Tool = {
  name: 'Write',
  description: 'Creates or overwrites a file with the given content. Use Edit for partial modifications. Use Write for creating new files or when you want to completely replace file contents.',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: 'File path to write to' },
      content: { type: 'string', description: 'The complete file content to write' },
    },
    required: ['file_path', 'content'],
  },

  async call(input: ToolInput, context: ToolContext): Promise<ToolResult> {
    let filePathStr = input.file_path as string;
    const content = input.content as string;

    // 防呆：如果写入目标以 .png 结尾，且写入内容明显是文本 JSON，则自动校正为 .json 格式
    if (filePathStr.endsWith('.png') && content.trim().startsWith('{')) {
      filePathStr = filePathStr.replace(/\.png$/, '.json');
    }

    const filePath = resolve(context.cwd, filePathStr);

    try {
      // Track history before overwrite
      try {
        const existing = await readTextFile(filePath);
        if (!context.fileHistory.has(filePath)) {
          context.fileHistory.set(filePath, []);
        }
        context.fileHistory.get(filePath)!.push({
          content: existing,
          timestamp: Date.now(),
        });
      } catch {
        // File doesn't exist yet, no history to track
      }

      await mkdir(dirname(filePath), { recursive: true });
      await writeTextFile(filePath, content);

      // Update read state
      context.readFileState.set(filePath, {
        content,
        timestamp: Date.now(),
      });

      return {
        success: true,
        output: `Successfully wrote to ${filePathStr} (${content.length} bytes)`,
      };
    } catch (err: any) {
      return { success: false, output: '', error: err.message };
    }
  },
};
