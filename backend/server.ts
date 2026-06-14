// --- Node.js & Bun 双模兼容运行 Polyfill 层 ---
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);

if (typeof Bun === 'undefined') {
  const fs = require('fs');
  const path = require('path');
  const http = require('http');

  (globalThis as any).Bun = {
    file: (filePath: string) => {
      const absPath = path.resolve(filePath);
      return {
        exists: async () => fs.existsSync(absPath),
        text: async () => fs.readFileSync(absPath, 'utf-8'),
        arrayBuffer: async () => {
          const buf = fs.readFileSync(absPath);
          return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        }
      };
    },
    write: async (filePath: string, content: any) => {
      const absPath = path.resolve(filePath);
      fs.writeFileSync(absPath, Buffer.from(content));
    },
    serve: (options: { port: number; fetch: (req: Request) => Promise<Response>; idleTimeout?: number }) => {
      const server = http.createServer(async (nodeReq: any, nodeRes: any) => {
        try {
          const protocol = nodeReq.headers['x-forwarded-proto'] || 'http';
          const host = nodeReq.headers.host || `localhost:${options.port}`;
          const url = new URL(nodeReq.url, `${protocol}://${host}`);

          const chunks: any[] = [];
          for await (const chunk of nodeReq) {
            chunks.push(chunk);
          }
          const bodyBuf = Buffer.concat(chunks);

          const webReq = new Request(url.toString(), {
            method: nodeReq.method,
            headers: nodeReq.headers as HeadersInit,
            body: ['GET', 'HEAD', 'OPTIONS'].includes(nodeReq.method) ? null : bodyBuf
          });

          const webRes = await options.fetch(webReq);

          nodeRes.statusCode = webRes.status;
          webRes.headers.forEach((value, key) => {
            nodeRes.setHeader(key, value);
          });

          const resBody = await webRes.arrayBuffer();
          nodeRes.end(Buffer.from(resBody));
        } catch (e: any) {
          console.error('[Node-Compat HTTP] Handler Error:', e);
          nodeRes.statusCode = 500;
          nodeRes.end(JSON.stringify({ error: e.message }));
        }
      });

      server.listen(options.port, '0.0.0.0', () => {
        console.log(`[Node-Compat] Polyfilled Bun Server running via Node.js on http://localhost:${options.port}`);
      });

      return { port: options.port };
    }
  };
}

// 动态环境路径解析，兼容 Node 与 Bun
import { resolve, dirname } from 'path';
const currentDir = typeof Bun !== 'undefined'
  ? import.meta.dir
  : dirname(fileURLToPath(import.meta.url));

import { ToolEngine } from './engine/ToolEngine';
import { ALL_TOOLS } from './tools';
import { extractDataFromPng, embedDataInPng } from './pngHelper';

// --- Configuration ---
const PORT = parseInt(process.env.NikaForge_PORT || '3456');
const CWD = process.env.NikaForge_CWD || resolve(currentDir, '../../../characters'); // Default: default-user characters folder
const CORS_ORIGIN = process.env.NikaForge_CORS || '*';

// --- Auto-detect SillyTavern Port from config.yaml ---
function getSillyTavernPort(): number {
  try {
    const { existsSync, readFileSync } = require('fs');
    const configPath = resolve(currentDir, '../../../../config.yaml');
    if (existsSync(configPath)) {
      const content = readFileSync(configPath, 'utf-8');
      const match = content.match(/^port:\s*(\d+)/m);
      if (match) {
        const port = parseInt(match[1]);
        if (!isNaN(port)) return port;
      }
    }
  } catch (e: any) {
    console.warn(`[NikaForge Backend] 读取 config.yaml 失败:`, e.message);
  }
  return 8000;
}
const ST_PORT = getSillyTavernPort();
console.log(`[NikaForge Backend] Detected SillyTavern Port: ${ST_PORT}`);

// --- Initialize Engine ---
const engine = new ToolEngine(CWD);
engine.registerTools(ALL_TOOLS);

console.log(`[NikaForge Backend] Initializing...`);
console.log(`  Working directory: ${CWD}`);
console.log(`  Registered tools: ${engine.getToolNames().join(', ')}`);

// --- 物理拷贝 stscript-reference.md 背景指南自愈保底 (防止其他用户因 Grep/scandir ENOENT 报错) ---
try {
  const { existsSync, copyFileSync } = require('fs');
  const sourceRefPath = resolve(currentDir, '../stscript-reference.md');
  const targetRefPath = resolve(CWD, 'stscript-reference.md');
  if (existsSync(sourceRefPath) && !existsSync(targetRefPath)) {
    copyFileSync(sourceRefPath, targetRefPath);
    console.log(`[NikaForge Backend] ✓ 自动物理拷贝 stscript-reference.md 保底指南到角色目录: ${targetRefPath}`);
  }
} catch (e: any) {
  console.warn(`[NikaForge Backend] ⚠ 自动拷贝指南文件自愈失败:`, e.message);
}

// --- JSON Response Helpers ---
function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': CORS_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': CORS_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

// --- PNG Character Card Handling Helpers (Imported from pngHelper.ts) ---

// --- Route Handler ---
async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  // --- Health Check ---
  if (path === '/api/health') {
    return jsonResponse({
      status: 'ok',
      version: '1.0.0',
      cwd: engine.getCwd(),
      tools: engine.getToolNames(),
      timestamp: Date.now(),
    });
  }

  // --- List Tool Schemas (OpenAI format) ---
  if (path === '/api/tools') {
    return jsonResponse(engine.getToolSchemas());
  }

  // --- Execute Tool ---
  if (path === '/api/tool' && req.method === 'POST') {
    try {
      const body = await req.json() as { name: string; input: Record<string, unknown> };
      if (!body.name) {
        return jsonResponse({ error: 'Missing tool name' }, 400);
      }
      const result = await engine.executeTool(body.name, body.input || {});
      return jsonResponse(result);
    } catch (err: any) {
      return jsonResponse({ error: err.message }, 500);
    }
  }

  // --- Git Version Control ---
  if (path === '/api/git' && req.method === 'POST') {
    try {
      const body = await req.json() as { action: string; message?: string; hash?: string; maxBackups?: number };
      const { spawn } = await import('child_process');
      const execGit = (args: string[]): Promise<string> => {
        return new Promise((resolve, reject) => {
          const proc = spawn('git', args, { cwd: engine.getCwd(), shell: false });
          let stdout = '';
          let stderr = '';
          proc.stdout.on('data', d => stdout += d.toString());
          proc.stderr.on('data', d => stderr += d.toString());
          proc.on('close', code => {
            if (code === 0) resolve(stdout.trim());
            else reject(new Error(stderr.trim() || stdout.trim() || `Git exited with ${code}`));
          });
        });
      };

      const pruneGitHistory = async (maxBackups: number) => {
        if (!maxBackups || maxBackups <= 0) return;
        try {
          const logOutput = await execGit(['log', '--format=%H']);
          const hashes = logOutput.split('\n').filter(Boolean).map(h => h.trim());
          if (hashes.length > maxBackups) {
            const boundaryHash = hashes[maxBackups - 1];
            if (boundaryHash && boundaryHash.length === 40) {
              const { writeFileSync } = await import('fs');
              const shallowPath = resolve(engine.getCwd(), '.git/shallow');
              writeFileSync(shallowPath, boundaryHash + '\n', 'utf-8');
              await execGit(['gc', '--prune=now', '--force']);
            }
          }
        } catch (err: any) {
          console.error('[Git Prune] prune failed:', err.message);
          throw err;
        }
      };

      if (body.action === 'init') {
        const { existsSync } = await import('fs');
        if (!existsSync(resolve(engine.getCwd(), '.git'))) {
          await execGit(['init']);
          await execGit(['config', 'user.name', 'NikaForge AutoBackup']);
          await execGit(['config', 'user.email', 'backup@nikaforge.local']);
        }
        // Ensure Chinese characters in file paths are displayed correctly
        await execGit(['config', 'core.quotepath', 'false']);
        return jsonResponse({ success: true });
      }

      if (body.action === 'status') {
        try {
          const status = await execGit(['status', '-s']);
          return jsonResponse({ success: true, changes: status });
        } catch (err: any) {
          return jsonResponse({ success: false, error: err.message }, 500);
        }
      }

      if (body.action === 'commit') {
        try {
          await execGit(['add', '.']);
          const msg = body.message || `自动备份: ${new Date().toLocaleString()}`;
          const res = await execGit(['commit', '-m', msg]);
          if (body.maxBackups && typeof body.maxBackups === 'number' && body.maxBackups > 0) {
            await pruneGitHistory(body.maxBackups);
          }
          return jsonResponse({ success: true, result: res });
        } catch (err: any) {
          if (err.message.includes('nothing to commit') || err.message.includes('无文件要提交')) {
            if (body.maxBackups && typeof body.maxBackups === 'number' && body.maxBackups > 0) {
              await pruneGitHistory(body.maxBackups);
            }
            return jsonResponse({ success: true, result: 'nothing to commit' });
          }
          return jsonResponse({ success: false, error: err.message }, 500);
        }
      }

      if (body.action === 'prune') {
        try {
          if (body.maxBackups && typeof body.maxBackups === 'number' && body.maxBackups > 0) {
            await pruneGitHistory(body.maxBackups);
            return jsonResponse({ success: true });
          }
          return jsonResponse({ success: false, error: 'Invalid maxBackups parameter' }, 400);
        } catch (err: any) {
          return jsonResponse({ success: false, error: err.message }, 500);
        }
      }

      if (body.action === 'log') {
        try {
          const log = await execGit(['log', '--pretty=format:%H|%ad|%s', '--date=format:%Y-%m-%d %H:%M:%S', '-n', '50']);
          if (!log) return jsonResponse({ success: true, logs: [] });
          
          const commits = log.split('\n').filter(Boolean).map(line => {
            const [hash, date, ...msgParts] = line.split('|');
            return { hash, date, message: msgParts.join('|') };
          });
          
          for (const commit of commits) {
            try {
              const show = await execGit(['show', '--name-status', '--oneline', commit.hash]);
              const lines = show.split('\n').filter(Boolean);
              const changes = lines.slice(1).map(l => {
                const parts = l.split('\t');
                return { status: parts[0][0], file: parts[1] || parts[0].substring(1).trim() };
              });
              (commit as any).changes = changes;
            } catch (e) {
              (commit as any).changes = [];
            }
          }
          return jsonResponse({ success: true, logs: commits });
        } catch (err: any) {
          return jsonResponse({ success: false, error: err.message }, 500);
        }
      }

      if (body.action === 'reset') {
        if (!body.hash) return jsonResponse({ success: false, error: 'Missing hash' }, 400);
        try {
          // 1. 先确保任何未保存的更改被提交，防止丢失
          await execGit(['add', '.']);
          const statusRes = await execGit(['status', '-s']);
          if (statusRes.trim() !== '') {
            const dateStr = new Date().toLocaleString('zh-CN', { hour12: false });
            await execGit(['commit', '-m', `自动备份(恢复前): ${dateStr}`]);
          }

          // 获取当前的最新 commit hash
          const currentHeadRes = await execGit(['rev-parse', 'HEAD']);
          const currentHead = currentHeadRes.trim();

          if (currentHead === body.hash || currentHead.startsWith(body.hash)) {
            return jsonResponse({ success: true });
          }

          // 2. 核心：回退工作区但不断开历史记录
          // 强制将工作区和索引重置为目标版本
          await execGit(['reset', '--hard', body.hash]);
          await execGit(['clean', '-fd']);
          
          // 将 HEAD 软重置回刚刚的最新状态
          // 这样索引就变成了“将最新版本改成目标版本”的差异
          await execGit(['reset', '--soft', currentHead]);
          
          // 3. 提交这个差异，作为一个新的向前追加的 commit
          await execGit(['commit', '-m', `恢复到版本: ${body.hash.substring(0, 7)}`]);

          return jsonResponse({ success: true });
        } catch (err: any) {
          return jsonResponse({ success: false, error: err.message }, 500);
        }
      }

      return jsonResponse({ error: 'Unknown action' }, 400);
    } catch (err: any) {
      return jsonResponse({ error: err.message }, 500);
    }
  }

  // --- Proxy SillyTavern Slash Commands (Second Layer Rescue) ---
  if (path === '/api/slash' && req.method === 'POST') {
    try {
      const body = await req.json() as { command: string };
      if (!body.command) {
        return jsonResponse({ error: 'Missing command' }, 400);
      }

      const clientHeaders: Record<string, string> = {
        'Content-Type': 'application/json; charset=utf-8',
      };

      // 透传安全和鉴权 Header，保持身份有效性
      const authHeader = req.headers.get('Authorization');
      if (authHeader) clientHeaders['Authorization'] = authHeader;
      const cookieHeader = req.headers.get('Cookie');
      if (cookieHeader) clientHeaders['Cookie'] = cookieHeader;
      const csrfHeader = req.headers.get('X-CSRF-Token');
      if (csrfHeader) clientHeaders['X-CSRF-Token'] = csrfHeader;

      const targetUrl = `http://127.0.0.1:${ST_PORT}/api/slash`;
      const proxyResponse = await fetch(targetUrl, {
        method: 'POST',
        headers: clientHeaders,
        body: JSON.stringify({ command: body.command }),
      });

      const data = await proxyResponse.json();
      return jsonResponse(data, proxyResponse.status);
    } catch (err: any) {
      return jsonResponse({ error: `Failed to proxy slash command to SillyTavern: ${err.message}` }, 502);
    }
  }

  // --- Proxy AI Models List (bypasses browser CORS) ---
  if (path === '/api/models' && req.method === 'POST') {
    try {
      const body = await req.json() as { api_url: string; api_key: string };
      const { api_url, api_key } = body;

      if (!api_url || !api_key) {
        return jsonResponse({ error: 'Missing api_url or api_key' }, 400);
      }

      const targetUrl = `${api_url.replace(/\/$/, '')}/models`;
      const proxyResponse = await fetch(targetUrl, {
        headers: { 'Authorization': `Bearer ${api_key}` },
      });

      const data = await proxyResponse.json();
      return jsonResponse(data, proxyResponse.status);
    } catch (err: any) {
      return jsonResponse({ error: `Proxy error: ${err.message}` }, 502);
    }
  }

  // --- Proxy AI Chat Completions (OpenAI format passthrough) ---
  if (path === '/api/chat/completions' && req.method === 'POST') {
    try {
      const body = await req.json() as {
        api_url: string;
        api_key: string;
        model: string;
        messages: unknown[];
        tools?: unknown[];
        stream?: boolean;
        [key: string]: unknown;
      };

      const { api_url, api_key, ...requestBody } = body;

      if (!api_url || !api_key) {
        return jsonResponse({ error: 'Missing api_url or api_key' }, 400);
      }

      // Inject backend tool schemas if not provided
      if (!requestBody.tools) {
        requestBody.tools = engine.getToolSchemas();
      }

      const targetUrl = `${api_url.replace(/\/$/, '')}/chat/completions`;

      const proxyResponse = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${api_key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        // 核心修复：透传客户端的中止信号！当客户端主动断开（Abort）时，
        // 同步切断这个 upstream fetch，防止 Bun 底层在 proxyResponse.body 到关闭的 socket 时发生 segfault
        signal: req.signal,
      });

      // Stream passthrough — 直接透传 body
      if (body.stream) {
        return new Response(proxyResponse.body, {
          status: proxyResponse.status,
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            'X-Accel-Buffering': 'no',
            ...corsHeaders(),
          },
        });
      }

      const result = await proxyResponse.json();
      return jsonResponse(result, proxyResponse.status);
    } catch (err: any) {
      return jsonResponse({ error: `Proxy error: ${err.message}` }, 502);
    }
  }

  // --- File Operations (direct filesystem bridge for frontend) ---
  if (path === '/api/files/list' && req.method === 'GET') {
    try {
      const { readdir } = await import('fs/promises');
      const cwd = engine.getCwd();
      const files = await readdir(cwd);

      const fileList: string[] = [];

      // 1. 扫描根目录下的角色物理卡
      for (const f of files) {
        if (f.endsWith('.png') || f.endsWith('.json')) {
          fileList.push(f);
        }
      }

      // 2. 扫描 NikaForge_json_cache 子目录下的文件（如开发 JSON 副本和 README 说明文件）
      const cacheDir = resolve(cwd, 'NikaForge_json_cache');
      const { existsSync } = await import('fs');
      if (existsSync(cacheDir)) {
        const cacheFiles = await readdir(cacheDir);
        for (const cf of cacheFiles) {
          if (cf.endsWith('.json') || cf.endsWith('.txt') || cf.endsWith('.md')) {
            fileList.push(`NikaForge_json_cache/${cf}`);
          }
        }
      }

      return jsonResponse({ files: fileList });
    } catch (err: any) {
      return jsonResponse({ error: err.message }, 500);
    }
  }

  if (path === '/api/files' && req.method === 'GET') {
    const subdir = url.searchParams.get('dir') || '.';
    const result = await engine.executeTool('Bash', {
      command: process.platform === 'win32'
        ? `dir /b "${resolve(engine.getCwd(), subdir)}"`
        : `ls -1 "${resolve(engine.getCwd(), subdir)}"`,
    });
    return jsonResponse({ files: result.output.split('\n').filter(Boolean) });
  }

  if (path === '/api/file' && req.method === 'GET') {
    const filePath = url.searchParams.get('path');
    if (!filePath) return jsonResponse({ error: 'Missing path parameter' }, 400);
    try {
      const fullPath = resolve(engine.getCwd(), filePath);
      const file = Bun.file(fullPath);
      if (await file.exists()) {
        if (filePath.endsWith('.png')) {
          const arrayBuffer = await file.arrayBuffer();
          const jsonText = extractDataFromPng(new Uint8Array(arrayBuffer));
          try {
            const formatted = JSON.stringify(JSON.parse(jsonText), null, 4);
            return jsonResponse({ success: true, output: formatted });
          } catch {
            return jsonResponse({ success: true, output: jsonText });
          }
        }
        const text = await file.text();
        return jsonResponse({ success: true, output: text });
      } else {
        // 保底：如果是手册不存在且为相对路径，可继续在后端 engine CWD 下尝试找 NikaForge 插件目录下的
        if (filePath.endsWith('stscript-reference.md')) {
          const fallbackPath = resolve(currentDir, '../stscript-reference.md');
          const fallbackFile = Bun.file(fallbackPath);
          if (await fallbackFile.exists()) {
            return jsonResponse({ success: true, output: await fallbackFile.text() });
          }
        }
        return jsonResponse({ success: false, error: `File not found: ${filePath}` }, 404);
      }
    } catch (err: any) {
      return jsonResponse({ success: false, error: err.message }, 500);
    }
  }

  if (path === '/api/file' && req.method === 'POST') {
    const body = await req.json() as { path: string; content: string };

    if (body.path.endsWith('.png')) {
      try {
        const fullPath = resolve(engine.getCwd(), body.path);
        const file = Bun.file(fullPath);
        if (await file.exists()) {
          const originalBytes = new Uint8Array(await file.arrayBuffer());
          const newPngBytes = embedDataInPng(originalBytes, body.content);
          await Bun.write(fullPath, newPngBytes);

          // --- 联动自动净化酒馆的 DiskCache 缓存，避免修改不生效 ---
          try {
            const cacheDir = resolve(engine.getCwd(), '../../_cache/characters');
            const { existsSync } = await import('fs');
            if (existsSync(cacheDir)) {
              const { readdir, readFile, unlink } = await import('fs/promises');
              const { join } = await import('path');
              const files = await readdir(cacheDir);
              const escapedFullPath = fullPath.replace(/\\/g, '\\\\');
              for (const f of files) {
                const cacheFilePath = join(cacheDir, f);
                const stat = await Bun.file(cacheFilePath).exists();
                if (stat) {
                  const content = await readFile(cacheFilePath, 'utf-8');
                  if (content.includes(escapedFullPath) || content.includes(body.path)) {
                    await unlink(cacheFilePath);
                  }
                }
              }
            }
          } catch (cacheErr: any) {
            console.warn(`[NikaForge Backend] 警告: 自动联动清理缓存失败: ${cacheErr.message}`);
          }

          return jsonResponse({ success: true, output: `成功保存并双向封包 PNG 角色卡 ${body.path}，已自动刷新酒馆数据缓存。` });
        } else {
          return jsonResponse({ success: false, error: '原 PNG 模板图片不存在，无法直接保存二进制角色卡。' }, 404);
        }
      } catch (err: any) {
        return jsonResponse({ success: false, error: `封包 PNG 失败: ${err.message}` }, 500);
      }
    }

    const result = await engine.executeTool('Write', {
      file_path: body.path,
      content: body.content,
    });
    return jsonResponse(result);
  }

  if (path === '/api/file/delete' && req.method === 'POST') {
    try {
      const body = await req.json() as { path: string };
      if (!body.path) return jsonResponse({ error: 'Missing path parameter' }, 400);
      const { unlink } = await import('fs/promises');
      const fullPath = resolve(engine.getCwd(), body.path);
      await unlink(fullPath);
      return jsonResponse({ success: true, output: `Successfully deleted ${body.path}` });
    } catch (err: any) {
      return jsonResponse({ success: false, error: err.message }, 500);
    }
  }

  // --- Rewind ---
  if (path === '/api/rewind' && req.method === 'POST') {
    const body = await req.json() as { path: string; timestamp: number };
    const result = engine.rewindFile(body.path, body.timestamp);
    return jsonResponse(result);
  }

  // --- 404 ---
  return jsonResponse({ error: `Not found: ${path}` }, 404);
}

// --- Start Server ---
const server = Bun.serve({
  port: PORT,
  fetch: handleRequest,
  idleTimeout: 255, // 设置最大空闲超时，防止大模型请求慢时被强制断开 (默认10秒或太短会导致 network error)
});

console.log(`[NikaForge Backend] Server running at http://localhost:${server.port}`);
console.log(`[NikaForge Backend] Ready to accept connections from NikaForge frontend.`);
