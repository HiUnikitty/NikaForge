// NikaForge Backend - ReadCodeBlockTool
// Physical role card embedded code block reader

import { readTextFile } from '../pngHelper';
import { resolve } from 'path';
import type { Tool, ToolInput, ToolResult, ToolContext } from '../engine/types';
import { extractCodeBlocks } from './utils';

export const ReadCodeBlockTool: Tool = {
  name: 'ReadCodeBlock',
  description: '读取物理角色卡 JSON 文件中由 ``` 包裹的嵌入代码块。返回展开后的原始明文代码（带行号），而非 JSON 转义字符串。如果不指定 key，则列出文件中所有代码块的概要。',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '角色卡 JSON 相对或绝对路径' },
      key: { type: 'string', description: '目标字段名（如 first_mes、description）。不指定则列出所有代码块概要' },
      offset: { type: 'number', description: '起始行号（从1开始，用于分页读取超大代码块）' },
      limit: { type: 'number', description: '读取的最大行数（默认 500 行，最大允许 1500 行）' }
    },
    required: ['path']
  },

  async call(input: ToolInput, context: ToolContext): Promise<ToolResult> {
    const filePath = resolve(context.cwd, input.path as string);
    const key = input.key as string | undefined;
    const offset = Math.max(1, (input.offset as number) || 1) - 1; // 0-indexed
    const limit = Math.min(1500, (input.limit as number) || 500);

    try {
      const fileContent = await readTextFile(filePath);
      if (key && (key.includes('.') || key.includes('['))) {
        const data = JSON.parse(fileContent);
        const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.');
        let current = data;
        for (const part of parts) {
          if (current && typeof current === 'object' && part in current) {
            current = current[part];
          } else {
            return { success: false, output: '', error: `JSON 路径 "${key}" 不存在。` };
          }
        }
        let output = '';
        if (typeof current === 'string') {
          const allLines = current.split('\n');
          const totalLines = allLines.length;
          const selectedLines = allLines.slice(offset, offset + limit);
          const numberedLines = selectedLines.map((line, i) => `${offset + i + 1}: ${line}`).join('\n');
          output = `字段 "${key}" 的内容 (共 ${totalLines} 行，当前显示 ${offset + 1}-${Math.min(offset + limit, totalLines)} 行):\n\n${numberedLines}`;
          if (totalLines > offset + limit) {
            output += `\n\n【警告】: 内容过长（共 ${totalLines} 行，当前仅显示第 ${offset + 1} 到 ${offset + limit} 行，还剩 ${totalLines - (offset + limit)} 行未显示）。为防止 Token 爆炸，已强制截断！\n【建议】: 若要继续读取下一页，请在下一次工具调用中指定 offset: ${offset + limit + 1}，且保持 limit 参数。`;
          }
        } else {
          output = `字段 "${key}" 的内容 (非纯字符串):\n\n${JSON.stringify(current, null, 2)}`;
        }
        return { success: true, output };
      }

      if (!key) {
        // 遍历整个 JSON 文件列出所有包含代码的区块
        const data = JSON.parse(fileContent);
        const blocks: { path: string, type: string, preview: string, lineCount: number }[] = [];

        const traverse = (obj: any, currentPath: string) => {
          if (typeof obj === 'string') {
            const lineCount = obj.split('\n').length;
            if (obj.includes('```')) {
              blocks.push({ path: currentPath || '未命名顶层', type: '```包裹的代码块', preview: obj.substring(0, 50).replace(/\n/g, ' ') + '...', lineCount });
            } else if (currentPath.includes('regex_scripts') && currentPath.endsWith('replaceString')) {
              blocks.push({ path: currentPath, type: '正则脚本替换区', preview: obj.substring(0, 50).replace(/\n/g, ' ') + '...', lineCount });
            }
          } else if (Array.isArray(obj)) {
            obj.forEach((item, index) => traverse(item, currentPath ? currentPath + '[' + index + ']' : '[' + index + ']'));
          } else if (obj !== null && typeof obj === 'object') {
            for (const [k, v] of Object.entries(obj)) {
              const nextPath = currentPath ? currentPath + '.' + k : k;
              traverse(v, nextPath);
            }
          }
        };

        traverse(data, '');

        if (blocks.length === 0) {
          return { success: true, output: `文件 ${input.path} 中未检测到任何代码块或嵌套脚本。` };
        }

        const summary = `在 ${input.path} 中检测到 ${blocks.length} 个可能包含代码的区块：\n\n` +
          blocks.map((b, i) => `  ${i + 1}. [${b.type}] 路径: "${b.path}" (约 ${b.lineCount} 行)\n     预览: ${b.preview}`).join('\n');

        return { success: true, output: summary + '\n\n【重要提示】: 将上方列出的路径(如 "first_mes")作为 key 传给此工具即可读取无截断明文代码。\n如果某个代码块行数极大（如数万行），请配合 offset 和 limit 参数按需分块读取，防止 Token 爆炸。' };
      }

      const codeBlocks = extractCodeBlocks(fileContent);
      const targetBlock = codeBlocks.find(b => b.key === key);
      if (!targetBlock) {
        const available = codeBlocks.map(b => `"${b.key}"`).join(', ');
        return {
          success: false,
          output: '',
          error: `错误: 字段 "${key}" 中未找到代码块。可用的代码块字段有: ${available}`
        };
      }

      const allLines = targetBlock.rawCode.split('\n');
      const totalLines = allLines.length;
      const selectedLines = allLines.slice(offset, offset + limit);
      const numberedCode = selectedLines.map((line, i) => `${offset + i + 1}: ${line}`).join('\n');

      let finalOutput = `字段 "${targetBlock.key}" 的物理展开代码块 [${targetBlock.rawLangLabel.toUpperCase()}] (共 ${totalLines} 行，当前显示 ${offset + 1}-${Math.min(offset + limit, totalLines)} 行):\n` + numberedCode;
      if (totalLines > offset + limit) {
        finalOutput += `\n\n【警告】: 内容过长（共 ${totalLines} 行，当前仅显示第 ${offset + 1} 到 ${offset + limit} 行，还剩 ${totalLines - (offset + limit)} 行未显示）。为防止 Token 爆炸，已强制截断！\n【建议】: 若要继续读取下一页，请在下一次工具调用中指定 offset: ${offset + limit + 1}，且保持 limit 参数。`;
      }
      return { success: true, output: finalOutput };
    } catch (err: any) {
      return { success: false, output: '', error: err.message };
    }
  }
};
