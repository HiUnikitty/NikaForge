// NikaForge Backend - WriteCodeBlockTool
// Physical role card embedded code block writer (full overwrite)

import { readTextFile, writeTextFile } from '../pngHelper';
import { resolve } from 'path';
import type { Tool, ToolInput, ToolResult, ToolContext } from '../engine/types';
import { extractCodeBlocks, wrapInQuotes } from './utils';

export const WriteCodeBlockTool: Tool = {
  name: 'WriteCodeBlock',
  description: '直接覆盖物理写入角色卡 JSON 中指定字段的嵌入代码块。直接传入全新完整的代码内容（明文，包含真实换行符），工具自动处理 JSON 转义和回写，无需提供 old_string。适用于全新代码写入或大规模重构。',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '角色卡 JSON 文件路径' },
      key: { type: 'string', description: '目标字段名（如 first_mes）' },
      code: { type: 'string', description: '要写入的全新完整代码内容（明文，包含真实换行符）' }
    },
    required: ['path', 'key', 'code']
  },

  async call(input: ToolInput, context: ToolContext): Promise<ToolResult> {
    const filePath = resolve(context.cwd, input.path as string);
    const key = input.key as string;
    const code = input.code as string;

    try {
      const fileContent = await readTextFile(filePath);

      // JSON Path write logic
      if (key.includes('.') || key.includes('[')) {
          const data = JSON.parse(fileContent);
          const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.');
          let current = data;
          for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (current && typeof current === 'object' && part in current) {
              current = current[part];
            } else {
              return { success: false, output: '', error: `JSON 路径 "${key}" 中途失败于 "${part}"。` };
            }
          }
          const lastPart = parts[parts.length - 1];
          if (!current || typeof current !== 'object') {
              return { success: false, output: '', error: `JSON 路径无效。` };
          }

          let finalCode = code;
          if (!finalCode.trim().startsWith('```')) {
              finalCode = "```html\n" + finalCode.trim() + "\n```";
          }
          current[lastPart] = finalCode;

          if (!context.fileHistory.has(filePath)) {
            context.fileHistory.set(filePath, []);
          }
          context.fileHistory.get(filePath)!.push({
            content: fileContent,
            timestamp: Date.now(),
          });

          const updatedContent = JSON.stringify(data, null, 4);
          await writeTextFile(filePath, updatedContent);

          context.readFileState.set(filePath, {
            content: updatedContent,
            timestamp: Date.now(),
          });

          return { success: true, output: `成功将 ${code.split('\n').length} 行内容写入到字段 "${key}" 中。` };
      }

      const codeBlocks = extractCodeBlocks(fileContent);
      const targetBlock = codeBlocks.find(b => b.key === key);

      let before: string;
      let after: string;
      let newWrapped: string;

      if (targetBlock) {
        newWrapped = wrapInQuotes(targetBlock.rawLangLabel, code);
        before = fileContent.substring(0, targetBlock.startIndex);
        after = fileContent.substring(targetBlock.endIndex);
      } else {
        // Fallback: 如果字段为空或者不包含代码块，我们通过正则强行定位该 JSON 字符串键值对
        const keyRegex = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`);
        const match = keyRegex.exec(fileContent);
        if (match) {
          newWrapped = wrapInQuotes("html", code);
          // 找到冒号的位置，再找冒号后面的第一个双引号，确保绝对精准命中"值"的部分，防止键名与值同名时的误伤
          const colonIndex = match[0].indexOf(':', `"${key}"`.length);
          const quoteStart = match[0].indexOf('"', colonIndex);
          const startIndex = match.index + quoteStart;
          const endIndex = startIndex + match[1].length + 2;
          before = fileContent.substring(0, startIndex);
          after = fileContent.substring(endIndex);
        } else {
          const available = codeBlocks.map(b => `"${b.key}"`).join(', ');
          return {
            success: false,
            output: '',
            error: `错误: 字段 "${key}" 不存在或不是字符串类型，无法写入。当前已有的代码块字段有: ${available || '无'}`
          };
        }
      }

      // 备份历史 (用于回退)
      if (!context.fileHistory.has(filePath)) {
        context.fileHistory.set(filePath, []);
      }
      context.fileHistory.get(filePath)!.push({
        content: fileContent,
        timestamp: Date.now(),
      });

      const updatedContent = before + newWrapped + after;

      await writeTextFile(filePath, updatedContent);

      // 更新读取缓存状态
      context.readFileState.set(filePath, {
        content: updatedContent,
        timestamp: Date.now(),
      });

      return {
        success: true,
        output: `成功物理完全覆写字段 "${key}" 中的代码块 (${input.path})，覆盖后的内容包含 ${code.split('\n').length} 行。`
      };
    } catch (err: any) {
      return { success: false, output: '', error: err.message };
    }
  }
};
