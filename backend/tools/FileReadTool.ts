// NikaForge Backend - FileReadTool
// Ported from Claude Code's tools/FileReadTool/

import { stat } from 'fs/promises';
import { readTextFile } from '../pngHelper';
import { resolve, relative } from 'path';
import type { Tool, ToolInput, ToolResult, ToolContext } from '../engine/types';

const MAX_READ_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_LINES_NO_RANGE = 2000;

function truncateJsonStrings(obj: any, maxLength: number): any {
  if (typeof obj === 'string') {
    if (obj.length > maxLength) {
      return obj.substring(0, maxLength) + `\n\n... [TRUNCATED! Original length: ${obj.length} chars. Pass truncate: false to Read tool to view full content, or use ReadCodeBlock/EditCodeBlock tools.]`;
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => truncateJsonStrings(item, maxLength));
  }
  if (obj !== null && typeof obj === 'object') {
    const newObj: any = {};
    for (const key in obj) {
      newObj[key] = truncateJsonStrings(obj[key], maxLength);
    }
    return newObj;
  }
  return obj;
}

export const FileReadTool: Tool = {
  name: 'Read',
  description: 'Reads a file from the filesystem. Returns the file content with line numbers. For JSON files, long string fields are truncated by default to save tokens.',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: 'Absolute or relative file path to read' },
      offset: { type: 'number', description: 'Line number to start reading from (1-indexed)' },
      limit: { type: 'number', description: 'Number of lines to read' },
      truncate: { type: 'number', description: 'Max chars for JSON string fields. Default 300. Use 0 to disable.' },
    },
    required: ['file_path'],
  },

  async call(input: ToolInput, context: ToolContext): Promise<ToolResult> {
    let filePath = resolve(context.cwd, input.file_path as string);

    // 保底容错：如果在原 CWD 路径找不到该文件，且文件名是 stscript-reference.md，则自动重定向到插件安装根目录下
    try {
      await stat(filePath);
    } catch (e: any) {
      if (e.code === 'ENOENT' && filePath.endsWith('stscript-reference.md')) {
        filePath = resolve(import.meta.dir, '../../stscript-reference.md');
      }
    }

    try {
      // Check file size first
      const fileStat = await stat(filePath);
      if (fileStat.size > MAX_READ_SIZE) {
        return {
          success: false,
          output: '',
          error: `File too large (${(fileStat.size / 1024 / 1024).toFixed(1)}MB). Max: ${MAX_READ_SIZE / 1024 / 1024}MB. Use offset/limit for partial reads.`,
        };
      }

      let content = await readTextFile(filePath);
      
      const truncateLimit = input.truncate !== undefined ? (input.truncate === false ? 0 : Number(input.truncate)) : 300;
      let truncatedMsg = '';
      
      if (truncateLimit > 0 && filePath.toLowerCase().endsWith('.json')) {
        try {
          const jsonObj = JSON.parse(content);
          const truncatedObj = truncateJsonStrings(jsonObj, truncateLimit);
          content = JSON.stringify(truncatedObj, null, 4);
          truncatedMsg = `\n(NOTE: JSON string fields longer than ${truncateLimit} chars were truncated. Use truncate: false to read full or use ReadCodeBlock.)`;
        } catch (e) {
          // ignore parsing error
        }
      }

      const lines = content.split('\n');
      const totalLines = lines.length;

      const offset = ((input.offset as number) || 1) - 1; // Convert to 0-indexed
      let requestedLimit = (input.limit as number) || (input.offset ? 500 : totalLines);
      const limit = Math.min(requestedLimit, MAX_LINES_NO_RANGE);

      const selectedLines = lines.slice(offset, offset + limit);
      const numberedLines = selectedLines.map((line, i) => `${offset + i + 1}: ${line}`).join('\n');

      // Track read state for FileEdit staleness check
      context.readFileState.set(filePath, {
        content, // NOTE: FileEdit tool might get truncated content state, but AI shouldn't use Edit on JSON anyway
        timestamp: Date.now(),
      });

      let rangeInfo = totalLines > limit
        ? `\n(Showing lines ${offset + 1}-${Math.min(offset + limit, totalLines)} of ${totalLines} total)`
        : '';
        
      if (totalLines > offset + limit) {
         rangeInfo += `\n\n【警告】: 文件内容过长（共 ${totalLines} 行，当前仅显示第 ${offset + 1} 到 ${offset + limit} 行，还剩 ${totalLines - (offset + limit)} 行未显示）。为防止 Token 爆炸，已自动截断！\n【建议】: 若要继续读取下一页，请在下一次工具调用中指定 offset: ${offset + limit + 1}，且保持 limit 参数。`;
      }

      return {
        success: true,
        output: numberedLines + rangeInfo + truncatedMsg,
      };
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return { success: false, output: '', error: `File not found: ${filePath}` };
      }
      if (err.code === 'EISDIR') {
        return { success: false, output: '', error: `Path is a directory, not a file: ${filePath}. Use Bash 'ls' to list contents.` };
      }
      return { success: false, output: '', error: err.message };
    }
  },
};
