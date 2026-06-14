// NikaForge Backend - EditCodeBlockTool
// Physical role card embedded code block editor (fuzzy/exact replace)

import { readTextFile, writeTextFile } from '../pngHelper';
import { resolve } from 'path';
import type { Tool, ToolInput, ToolResult, ToolContext } from '../engine/types';
import { extractCodeBlocks, wrapInQuotes, checkDangerousPatterns } from './utils';

export const EditCodeBlockTool: Tool = {
  name: 'EditCodeBlock',
  description: '直接物理修改角色卡 JSON 中某个字段的嵌入代码块。使用明文 old_string/new_string（包含真实换行符），工具自动处理所有的 JSON 转义和回写，无需手动处理 \\n 转义。',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '角色卡 JSON 文件路径' },
      key: { type: 'string', description: '目标字段名（如 first_mes）' },
      old_string: { type: 'string', description: '代码块中要替换的原始文本（Required if edits is not provided）' },
      new_string: { type: 'string', description: '替换后的新文本（Required if edits is not provided）' },
      edits: {
        type: 'array',
        description: 'Optional array of multiple edits to perform sequentially on the same field.',
        items: {
          type: 'object',
          properties: {
            old_string: { type: 'string', description: 'The exact text to find' },
            new_string: { type: 'string', description: 'The replacement text' }
          },
          required: ['old_string', 'new_string']
        }
      }
    },
    required: ['path', 'key']
  },

  async call(input: ToolInput, context: ToolContext): Promise<ToolResult> {
    const filePath = resolve(context.cwd, input.path as string);
    const key = input.key as string;
    const rawEdits: any[] = [];

    if (Array.isArray(input.edits)) {
      rawEdits.push(...input.edits);
    } else if (input.old_string !== undefined && input.new_string !== undefined) {
      rawEdits.push({
        old_string: input.old_string as string,
        new_string: input.new_string as string
      });
    } else {
      return { success: false, output: '', error: 'Either (old_string and new_string) or "edits" array must be provided.' };
    }

    try {
      // 静态安全检查：拦截所有 new_string 中会因 JSON 序列化而断裂的危险代码模式
      for (let i = 0; i < rawEdits.length; i++) {
        const dangerIssues = checkDangerousPatterns(rawEdits[i].new_string as string);
        if (dangerIssues.length > 0) {
          return {
            success: false,
            output: '',
            error: `⚠️ Edit #${i + 1} 的 new_string 代码静态检查未通过，编辑已阻止！请修复以下问题后重试：\n${dangerIssues.map((d, j) => `${j + 1}. ${d}`).join('\n')}`
          };
        }
      }

      const fileContent = await readTextFile(filePath);

      // JSON Path edit logic
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
          if (!current || typeof current !== 'object' || typeof current[lastPart] !== 'string') {
              return { success: false, output: '', error: `JSON 路径无效，或者该字段不是字符串类型。` };
          }

          const originalStr = current[lastPart];
          let currentStr = originalStr;

          for (let i = 0; i < rawEdits.length; i++) {
              const edit = rawEdits[i];
              const normOriginalStr = currentStr.replace(/\r\n/g, '\n');
              const normOldStr = (edit.old_string as string).replace(/\r\n/g, '\n');
              const normNewStr = (edit.new_string as string).replace(/\r\n/g, '\n');

              if (!normOriginalStr.includes(normOldStr)) {
                return {
                  success: false,
                  output: '',
                  error: `Edit #${i + 1} failed: 在字段 "${key}" 中未找到匹配的 old_string。`
                };
              }
              currentStr = normOriginalStr.replace(normOldStr, () => normNewStr);
          }

          current[lastPart] = currentStr;

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

          const detail = rawEdits.length > 1 ? ` (${rawEdits.length} replacement chunks applied)` : '';
          return { success: true, output: `成功物理修改字段 "${key}" 的内容${detail}。` };
      }

      const codeBlocks = extractCodeBlocks(fileContent);
      const targetBlock = codeBlocks.find(b => b.key === key);

      if (!targetBlock) {
        const available = codeBlocks.map(b => `"${b.key}"`).join(', ');
        return {
          success: false,
          output: '',
          error: `错误: 字段 "${key}" 中未找到代码块。可用的代码块字段有: ${available || '无'}`
        };
      }

      // 执行明文替换
      let currentCode = targetBlock.rawCode;

      for (let i = 0; i < rawEdits.length; i++) {
          const edit = rawEdits[i];
          const normOldCode = currentCode.replace(/\r\n/g, '\n');
          const normOldStr = (edit.old_string as string).replace(/\r\n/g, '\n');
          const normNewStr = (edit.new_string as string).replace(/\r\n/g, '\n');

          if (!normOldCode.includes(normOldStr)) {
            return {
              success: false,
              output: '',
              error: `Edit #${i + 1} failed: 在字段 "${key}" 的代码块中未找到匹配的 old_string。`
            };
          }
          currentCode = normOldCode.replace(normOldStr, () => normNewStr);
      }

      // 备份历史 (用于回退)
      if (!context.fileHistory.has(filePath)) {
        context.fileHistory.set(filePath, []);
      }
      context.fileHistory.get(filePath)!.push({
        content: fileContent,
        timestamp: Date.now(),
      });

      const newCode = currentCode;
      const newWrapped = wrapInQuotes(targetBlock.rawLangLabel, newCode);

      const before = fileContent.substring(0, targetBlock.startIndex);
      const after = fileContent.substring(targetBlock.endIndex);
      const updatedContent = before + newWrapped + after;

      await writeTextFile(filePath, updatedContent);

      // 更新读取缓存状态
      context.readFileState.set(filePath, {
        content: updatedContent,
        timestamp: Date.now(),
      });

      const detail = rawEdits.length > 1 ? ` (${rawEdits.length} replacement chunks applied)` : '';
      return {
        success: true,
        output: `成功物理修改字段 "${key}" 中的代码块 (${input.path})${detail}。`
      };
    } catch (err: any) {
      return { success: false, output: '', error: err.message };
    }
  }
};