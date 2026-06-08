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
