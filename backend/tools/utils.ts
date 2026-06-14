// NikaForge Backend - Character Card CodeBlock Utilities

export interface CodeBlock {
  key: string;
  lang: string;
  rawLangLabel: string;
  rawCode: string;
  startIndex: number;
  endIndex: number;
}

export function extractCodeBlocks(mainContent: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  const stringLiteralRegex = /"((?:[^"\\]|\\.)*)"/g;
  let match;
  while ((match = stringLiteralRegex.exec(mainContent)) !== null) {
    const stringValRaw = match[1];
    if (!stringValRaw.includes('```')) continue;
    const unescaped = stringValRaw
      .replace(/\\"/g, '"')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\\\/g, '\\');
    const trimmed = unescaped.trim();
    if (trimmed.startsWith('```') && trimmed.endsWith('```')) {
      const startIndex = match.index;
      const endIndex = stringLiteralRegex.lastIndex;
      let keyName = "未知字段";
      const beforeText = mainContent.substring(0, startIndex);
      const keyMatch = beforeText.match(/"([^"\\]+)"\s*:\s*$/);
      if (keyMatch) keyName = keyMatch[1];
      const contentWithoutStart = trimmed.substring(3);
      const firstNewlineIdx = contentWithoutStart.search(/\r?\n/);
      let lang = "plaintext";
      let rawCode = contentWithoutStart;
      if (firstNewlineIdx !== -1) {
        const possibleLang = contentWithoutStart.substring(0, firstNewlineIdx).trim();
        if (possibleLang) lang = possibleLang;
        rawCode = contentWithoutStart.substring(firstNewlineIdx + 1);
      }
      if (rawCode.endsWith('```')) rawCode = rawCode.substring(0, rawCode.length - 3);
      rawCode = rawCode.replace(/\r?\n$/, '');
      let monacoLang = 'plaintext';
      const lowLang = lang.toLowerCase();
      if (lowLang === 'html' || lowLang === 'xml') monacoLang = 'html';
      else if (lowLang === 'js' || lowLang === 'javascript') monacoLang = 'javascript';
      else if (lowLang === 'css') monacoLang = 'css';
      else if (lowLang === 'json') monacoLang = 'json';
      blocks.push({
        key: keyName,
        lang: monacoLang,
        rawLangLabel: lang,
        rawCode: rawCode,
        startIndex: startIndex,
        endIndex: endIndex,
      });
    }
  }
  return blocks;
}

export function wrapInQuotes(lang: string, newRawCode: string): string {
  const escaped = newRawCode
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
  return `"\`\`\`${lang}\\n${escaped}\\n\`\`\`"`;
}

/**
 * 静态检查：检测代码中会因 JSON 序列化而断裂的危险模式。
 * 返回检测到的问题列表（空数组表示安全）。
 */
export function checkDangerousPatterns(code: string): string[] {
  const issues: string[] = [];

  // 1. 检测正则中的 /\n/g 或 /\n/ （会被 JSON 展开为真实换行，导致正则断行）
  //    匹配形如 /...\n.../  的正则字面量中的 \n
  if (/\/[^\/]*\\n[^\/]*\/[gimsuy]*/g.test(code)) {
    issues.push('检测到正则表达式中使用了 /\\n/（会被 JSON 破坏为真实换行导致代码断裂）。请改用 /\\x0a/ 或使用 RegExp 构造函数。');
  }

  // 2. 检测 [\s\S] （会被 JSON 破坏为 [sS]）
  if (/\[\\s\\S\]/g.test(code)) {
    issues.push('检测到使用了 [\\s\\S] 匹配任意字符（会被 JSON 破坏为 [sS]）。必须改用 [^] 安全写法。');
  }

  // 3. 检测 split('\n') 或 split("\n") （\n 会被 JSON 展开）
  if (/split\s*\(\s*['"]\\n['"]\s*\)/g.test(code)) {
    issues.push('检测到使用了 split(\'\\n\')（\\n 会被 JSON 展开导致语法错误）。请使用 CSS white-space: pre-wrap 自然渲染换行，或使用 split(/\\x0a/)。');
  }

  // 4. 检测任何地方出现的 $1, $2 等模式（会被酒馆二次替换机制强行替换破坏）
  //    一旦在代码文本中直接出现 $ 紧跟数字，就予以拦截
  if (/\$\d+/.test(code)) {
    issues.push('检测到代码中直接出现了 $1、$2 等占位符（会被酒馆机制在加载时二次替换破坏）。任何地方的代码都不许直接出现 $1、$2 等模式，必须改用拼接绕过（例如：\'$\' + \'1\'），或在 replace 中使用函数回调。');
  }

  return issues;
}
