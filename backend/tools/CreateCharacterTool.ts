// NikaForge Backend - CreateCharacterTool
// Physical role card creator (v3 standard)

import { writeFile, mkdir } from 'fs/promises';
import { resolve, dirname } from 'path';
import type { Tool, ToolInput, ToolResult, ToolContext } from '../engine/types';

export const CreateCharacterTool: Tool = {
  name: 'CreateCharacter',
  description: '创建一个新的全屏 HTML 交互角色卡模板（V3 格式）。自动在物理磁盘上创建对应的物理 JSON 角色卡。',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '新角色卡 JSON 文件的物理相对或绝对路径，例如 default-user/characters/MyNewChar.json' },
      name: { type: 'string', description: '角色卡名称，例如 MyNewChar' }
    },
    required: ['path', 'name']
  },

  async call(input: ToolInput, context: ToolContext): Promise<ToolResult> {
    let targetPath = input.path as string;
    if (targetPath.endsWith('.png')) {
      targetPath = targetPath.replace(/\.png$/, '.json');
    }
    const filePath = resolve(context.cwd, targetPath);
    const name = input.name as string;

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
      "        <p>这是一个全屏可交互卡片模板</p>",
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
      "    <\/script>",
      "</body>",
      "</html>",
      "```"
    ].join('\n');

    const newCard = {
      "name": name,
      "description": "",
      "personality": "",
      "scenario": "",
      "first_mes": "by妮卡工坊",
      "mes_example": "",
      "creatorcomment": "",
      "avatar": "none",
      "talkativeness": "0.5",
      "fav": false,
      "tags": [],
      "spec": "chara_card_v3",
      "spec_version": "3.0",
      "data": {
        "name": name,
        "description": "",
        "personality": "",
        "scenario": "",
        "first_mes": "by妮卡工坊",
        "mes_example": "",
        "creator_notes": "",
        "system_prompt": "",
        "post_history_instructions": "",
        "tags": [],
        "creator": "NikaForge",
        "character_version": "1.0.0",
        "alternate_greetings": [],
        "extensions": {
          "talkativeness": "0.5",
          "fav": false,
          "world": "",
          "depth_prompt": {
            "prompt": "",
            "depth": 4,
            "role": "system"
          },
          "regex_scripts": [
            {
              "id": "nf-page-" + Date.now(),
              "scriptName": "页面",
              "findRegex": "by妮卡工坊",
              "replaceString": htmlTemplate,
              "trimStrings": [],
              "placement": [
                2
              ],
              "disabled": false,
              "markdownOnly": true,
              "promptOnly": false,
              "runOnEdit": true,
              "substituteRegex": 0
            },
            {
              "id": "nf-page-cleaner-" + Date.now(),
              "scriptName": "去除多余提示词",
              "findRegex": "by妮卡工坊",
              "replaceString": "",
              "trimStrings": [],
              "placement": [
                2
              ],
              "disabled": false,
              "markdownOnly": false,
              "promptOnly": true,
              "runOnEdit": true,
              "substituteRegex": 0
            }
          ]
        }
      }
    };

    try {
      const jsonString = JSON.stringify(newCard, null, 4);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, jsonString, 'utf-8');

      // 更新读取缓存状态
      context.readFileState.set(filePath, {
        content: jsonString,
        timestamp: Date.now(),
      });

      return {
        success: true,
        output: `成功物理创建交互角色卡模板！\n路径: ${input.path as string}\n已为 data.extensions.regex_scripts 注入 HelloWorld 全屏卡 HTML 模板（first_mes 仅作为占位符）。`
      };
    } catch (err: any) {
      return { success: false, output: '', error: err.message };
    }
  }
};
