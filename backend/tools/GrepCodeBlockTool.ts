// NikaForge Backend - GrepCodeBlockTool
// Search within embedded code blocks of a character card JSON

import { readTextFile } from '../pngHelper';
import { resolve } from 'path';
import type { Tool, ToolInput, ToolResult, ToolContext } from '../engine/types';
import { extractCodeBlocks } from './utils';

export const GrepCodeBlockTool: Tool = {
  name: 'GrepCodeBlock',
  description: '在指定角色卡的所有嵌入 ``` 代码块中执行正则表达式检索。返回包含匹配行的字段名、行号和上下文。',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '角色卡 JSON 文件相对或绝对路径' },
      pattern: { type: 'string', description: '要检索的正则表达式或关键字' }
    },
    required: ['path', 'pattern']
  },

  async call(input: ToolInput, context: ToolContext): Promise<ToolResult> {
    const filePath = resolve(context.cwd, input.path as string);
    const pattern = input.pattern as string;

    try {
      const fileContent = await readTextFile(filePath);

      const regex = new RegExp(pattern, 'i');
      const results: string[] = [];

      // 遍历解析 JSON 节点
      const data = JSON.parse(fileContent);
      const searchBlocks: { path: string, type: string, code: string }[] = [];

      const traverse = (obj: any, currentPath: string) => {
        if (typeof obj === 'string') {
          if (obj.includes('```')) {
             searchBlocks.push({ path: currentPath || '未命名顶层', type: '```包裹的代码块', code: obj });
          } else if (currentPath.includes('regex_scripts') && currentPath.endsWith('replaceString')) {
             searchBlocks.push({ path: currentPath, type: '正则脚本替换区', code: obj });
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

      // 合并 extractCodeBlocks 以防漏掉非标准 JSON 字段（如果有的话）
      const shallowBlocks = extractCodeBlocks(fileContent);
      for (const sb of shallowBlocks) {
         if (!searchBlocks.find(b => b.path === sb.key)) {
            searchBlocks.push({ path: sb.key, type: '```代码块(正则提取)', code: sb.rawCode });
         }
      }

      if (searchBlocks.length === 0) {
        return {
          success: true,
          output: `文件 ${input.path} 中没有嵌入的代码块可供检索。`
        };
      }

      for (const block of searchBlocks) {
        const lines = block.code.split('\n');
        const blockMatches: string[] = [];

        for (let i = 0; i < lines.length; i++) {
          if (regex.test(lines[i])) {
            blockMatches.push(`  行 ${i + 1}: ${lines[i].trim()}`);
          }
        }

        if (blockMatches.length > 0) {
          results.push(`--- 字段 "${block.path}" [${block.type}] (${blockMatches.length} 处匹配) ---\n` + blockMatches.join('\n'));
        }
      }

      if (results.length === 0) {
        return {
          success: true,
          output: `在角色卡 ${input.path} 的所有代码块中未找到 "${pattern}" 的检索匹配。`
        };
      }

      return {
        success: true,
        output: `检索匹配结果：\n\n` + results.join('\n\n')
      };
    } catch (err: any) {
      return { success: false, output: '', error: err.message };
    }
  }
};
