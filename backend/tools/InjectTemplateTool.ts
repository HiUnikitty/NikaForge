// NikaForge Backend - InjectTemplateTool
// Adds a game template into an existing character card

import { readTextFile, writeTextFile } from '../pngHelper';
import { resolve } from 'path';
import type { Tool, ToolInput, ToolResult, ToolContext } from '../engine/types';

export const InjectTemplateTool: Tool = {
  name: 'InjectTemplate',
  description: '为已有的角色卡注入全屏 HTML 游戏卡片模板。基于已有文件制作html必须要使用',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '角色卡 JSON 文件的相对或绝对物理路径，例如 default-user/characters/ExistingChar.json' }
    },
    required: ['path']
  },

  async call(input: ToolInput, context: ToolContext): Promise<ToolResult> {
    const filePath = resolve(context.cwd, input.path as string);

    try {
      const fileContent = await readTextFile(filePath);
      const cardData = JSON.parse(fileContent);

      // Check format
      let dataNode = cardData.data ? cardData.data : cardData;

      if (!dataNode.extensions) {
        dataNode.extensions = {};
      }
      if (!dataNode.extensions.regex_scripts) {
        dataNode.extensions.regex_scripts = [];
      }

      // 检查是否已经注入过
      if (dataNode.first_mes && typeof dataNode.first_mes === 'string' && dataNode.first_mes.includes('by妮卡工坊')) {
        return { success: false, output: '', error: '该卡片似乎已经注入过模板（first_mes 包含 by妮卡工坊 占位符）。请勿重复注入。' };
      }

      const htmlTemplate = [
        "```html",
        "<!DOCTYPE html>",
        "<html lang=\"zh-CN\">",
        "<head>",
        "    <meta charset=\"UTF-8\">",
        "    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">",
        "    <title>Hello World</title>",
        "    <style>",
        "        body {",
        "            background-color: #121212;",
        "            color: #e0e0e0;",
        "            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;",
        "            display: flex;",
        "            justify-content: center;",
        "            align-items: center;",
        "            height: 100vh;",
        "            margin: 0;",
        "            overflow: hidden;",
        "            background: radial-gradient(circle at center, #25183a 0%, #0d0b11 100%);",
        "        }",
        "        .container {",
        "            text-align: center;",
        "            padding: 40px 60px;",
        "            border: 1px solid rgba(255, 255, 255, 0.1);",
        "            border-radius: 16px;",
        "            background: rgba(30, 30, 40, 0.6);",
        "            backdrop-filter: blur(12px);",
        "            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);",
        "            border-color: rgba(255, 255, 255, 0.08);",
        "            transition: all 0.3s ease;",
        "        }",
        "        .container:hover {",
        "            transform: translateY(-5px);",
        "            box-shadow: 0 30px 60px rgba(100, 50, 150, 0.3);",
        "            border-color: rgba(140, 80, 255, 0.3);",
        "        }",
        "        h1 {",
        "            margin: 0 0 10px 0;",
        "            background: linear-gradient(135deg, #a855f7 0%, #3b82f6 100%);",
        "            -webkit-background-clip: text;",
        "            -webkit-text-fill-color: transparent;",
        "            font-size: 2.5rem;",
        "        }",
        "        p {",
        "            color: #aaa;",
        "            margin: 0 0 20px 0;",
        "            font-size: 1.1rem;",
        "        }",
        "        /* 现代悬浮全屏按钮 */",
        "        .fullscreen-btn {",
        "            position: fixed;",
        "            top: 20px;",
        "            right: 20px;",
        "            z-index: 9999;",
        "            background: rgba(255, 255, 255, 0.08);",
        "            backdrop-filter: blur(10px);",
        "            border: 1px solid rgba(255, 255, 255, 0.15);",
        "            color: #ffffff;",
        "            padding: 10px;",
        "            border-radius: 50%;",
        "            cursor: pointer;",
        "            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);",
        "            display: flex;",
        "            align-items: center;",
        "            justify-content: center;",
        "            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);",
        "        }",
        "        .fullscreen-btn:hover {",
        "            background: rgba(255, 255, 255, 0.18);",
        "            transform: scale(1.1) rotate(90deg);",
        "            border-color: rgba(255, 255, 255, 0.35);",
        "            box-shadow: 0 8px 32px rgba(138, 75, 243, 0.4);",
        "        }",
        "        .fullscreen-btn:active {",
        "            transform: scale(0.95);",
        "        }",
        "    </style>",
        "</head>",
        "<body>",
        "    <!-- 全屏控制按钮 -->",
        "    <button id=\"fullscreen-btn\" class=\"fullscreen-btn\" title=\"切换全屏\">",
        "        <svg id=\"fullscreen-icon\" viewBox=\"0 0 24 24\" width=\"20\" height=\"20\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\">",
        "            <path d=\"M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3\"></path>",
        "        </svg>",
        "    </button>",
        "",
        "    <div class=\"container\">",
        "        <h1>Hello World</h1>",
        "        <p>这是一个基于旧卡片转换的全屏可交互卡片模板</p>",
        "    </div>",
        "",
        "    <script>",
        "        // 全屏切换控制",
        "        const fsBtn = document.getElementById('fullscreen-btn');",
        "        const fsIcon = document.getElementById('fullscreen-icon');",
        "        ",
        "        fsBtn.addEventListener('click', () => {",
        "            if (!document.fullscreenElement) {",
        "                document.documentElement.requestFullscreen().catch(err => {",
        "                    console.error(\"无法启用全屏:\", err.message);",
        "                });",
        "            } else {",
        "                document.exitFullscreen();",
        "            }",
        "        });",
        "",
        "        document.addEventListener('fullscreenchange', () => {",
        "            if (document.fullscreenElement) {",
        "                // 退出全屏图标样式",
        "                fsIcon.innerHTML = '<path d=\"M4 14h6v6m10-6h-6v6M4 10h6V4m10 6h-6V4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>';",
        "            } else {",
        "                // 开启全屏图标样式",
        "                fsIcon.innerHTML = '<path d=\"M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>';",
        "            }",
        "        });",
        "    </script>",
        "</body>",
        "</html>",
        "```"
      ].join('\n');

      const oldFirstMes = dataNode.first_mes || '';

      // 1. 设置 first_mes 为 by妮卡工坊
      dataNode.first_mes = 'by妮卡工坊';
      if (cardData.first_mes !== undefined) {
        cardData.first_mes = 'by妮卡工坊';
      }

      // 2. 添加页面正则
      const newRegex = {
        scriptName: "页面",
        findRegex: "by妮卡工坊",
        replaceString: htmlTemplate,
        trimStrings: [],
        placement: [2],
        disabled: false,
        markdownOnly: true,
        promptOnly: false,
        runOnEdit: true,
        substituteRegex: 0
      };

      const cleanRegex = {
        scriptName: "去除多余提示词",
        findRegex: "by妮卡工坊",
        replaceString: "",
        trimStrings: [],
        placement: [2],
        disabled: false,
        markdownOnly: false,
        promptOnly: true,
        runOnEdit: true,
        substituteRegex: 0
      };

      dataNode.extensions.regex_scripts.unshift(newRegex);
      dataNode.extensions.regex_scripts.push(cleanRegex);

      if (!context.fileHistory.has(filePath)) {
        context.fileHistory.set(filePath, []);
      }
      context.fileHistory.get(filePath)!.push({
        content: fileContent,
        timestamp: Date.now(),
      });

      const updatedContent = JSON.stringify(cardData, null, 4);
      await writeTextFile(filePath, updatedContent);

      context.readFileState.set(filePath, {
        content: updatedContent,
        timestamp: Date.now(),
      });

      let outputMsg = `成功为已有角色卡注入游戏模板！\n路径: ${filePath}\n`;
      outputMsg += `原来的 first_mes 内容已被移出，您可以将其手动整合到 replaceString 或作为系统提示，以保持原有角色设定。\n`;
      outputMsg += `后续请使用 EditCodeBlock 或 WriteCodeBlock 针对 data.extensions.regex_scripts[0].replaceString 进行操作。`;

      return {
        success: true,
        output: outputMsg
      };

    } catch (err: any) {
      return { success: false, output: '', error: err.message };
    }
  }
};
