// NikaForge Backend - CheckCodeBlockTool
// Compile & Syntax checker for embedded code blocks using 'node --check'

import { mkdir, unlink, writeFile } from 'fs/promises';
import { readTextFile, writeTextFile } from '../pngHelper';
import { resolve, dirname } from 'path';
import { exec } from 'child_process';
import type { Tool, ToolInput, ToolResult, ToolContext } from '../engine/types';
import { extractCodeBlocks } from './utils';

export const CheckCodeBlockTool: Tool = {
  name: 'CheckCodeBlock',
  description: '对角色卡 JSON 中指定字段（如 first_mes）的嵌入 JavaScript 或 HTML 代码块进行语法正确性及编译检查，定位任何语法错漏（如括号未闭合、不合法字符等），返回编译器（node --check）输出。',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '角色卡 JSON 文件相对或绝对路径' },
      key: { type: 'string', description: '目标字段名（如 first_mes）' }
    },
    required: ['path', 'key']
  },

  async call(input: ToolInput, context: ToolContext): Promise<ToolResult> {
    const filePath = resolve(context.cwd, input.path as string);
    const key = input.key as string;

    try {
      const fileContent = await readTextFile(filePath);
      const codeBlocks = extractCodeBlocks(fileContent);
      const targetBlock = codeBlocks.find(b => b.key === key);

      if (!targetBlock) {
        return {
          success: false,
          output: '',
          error: `错误: 字段 "${key}" 中未检测到嵌入的代码块。`
        };
      }

      let jsContent = '';
      const rawCode = targetBlock.rawCode;

      if (targetBlock.lang === 'javascript') {
        jsContent = rawCode;
      } else if (targetBlock.lang === 'html') {
        // 提取 <script> 标签中的所有 JS
        const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
        let match;
        const jsParts = [];
        while ((match = scriptRegex.exec(rawCode)) !== null) {
          if (match[1]) jsParts.push(match[1]);
        }
        jsContent = jsParts.join('\n\n// --- NEXT SCRIPT BLOCK ---\n\n');
      }

      if (!jsContent.trim()) {
        return {
          success: true,
          output: `== CheckCodeBlock: 字段 "${key}" ==\n代码块中没有检测到需要编译检查的 JavaScript 脚本段。`
        };
      }

      // 创建一个物理的临时文件以运行 node --check
      const tempDir = resolve(context.cwd, '.NikaForge/temp');
      const tempFile = resolve(tempDir, `check_${key}_${Date.now()}.js`);

      await mkdir(dirname(tempFile), { recursive: true });
      await writeFile(tempFile, jsContent, 'utf-8');

      // 运行 node --check
      return new Promise<ToolResult>((resolvePromise) => {
        exec(`node --check "${tempFile}"`, async (err, stdout, stderr) => {
          // 清理临时文件
          try {
            await unlink(tempFile);
          } catch (e) { }

          if (err || stderr) {
            const errorReport = stderr || String(err);
            // 将绝对临时路径替换为更易读的字段标签，以免泄露系统绝对路径并让AI更好懂
            const cleanReport = errorReport.replace(new RegExp(tempFile.replace(/\\/g, '\\\\'), 'g'), `[${key} 代码块]`);

            resolvePromise({
              success: true, // 仍然返回 success: true 使得AI可以读取报告结果
              output: `== 编译语法检查失败 (发现语法错误) ==\n\n${cleanReport}`
            });
          } else {
            resolvePromise({
              success: true,
              output: `== 编译语法检查成功 ==\n\n字段 "${key}" 中的所有 JavaScript 脚本语法验证通过，没有发现语法编译错误。`
            });
          }
        });
      });
    } catch (err: any) {
      return { success: false, output: '', error: err.message };
    }
  }
};
