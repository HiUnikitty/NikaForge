import { readFile, writeFile } from 'fs/promises';

// --- PNG CRC32 Helper ---
const crc32 = (function () {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  return function (bytes: Uint8Array) {
    let crc = -1;
    for (let i = 0; i < bytes.length; i++) {
      crc = (crc >>> 8) ^ table[(crc ^ bytes[i]) & 0xff];
    }
    return (crc ^ -1) >>> 0;
  };
})();

function createTextChunk(type: string, data: Uint8Array): Uint8Array {
  const chunkType = new TextEncoder().encode(type);
  const chunkData = data;
  const chunkLength = new Uint8Array(4);
  new DataView(chunkLength.buffer).setUint32(0, chunkData.length);

  const toCrc = new Uint8Array(chunkType.length + chunkData.length);
  toCrc.set(chunkType);
  toCrc.set(chunkData, chunkType.length);
  const crcValue = crc32(toCrc);
  const crc = new Uint8Array(4);
  new DataView(crc.buffer).setUint32(0, crcValue);

  const chunk = new Uint8Array(12 + chunkData.length);
  chunk.set(chunkLength);
  chunk.set(chunkType, 4);
  chunk.set(chunkData, 8);
  chunk.set(crc, 8 + chunkData.length);

  return chunk;
}

export function extractDataFromPng(bytes: Uint8Array): string {
  let charaData: string | null = null;
  let ccv3Data: string | null = null;

  let i = 8;
  while (i < bytes.length) {
    if (i + 8 > bytes.length) break;
    const view = new DataView(bytes.buffer, bytes.byteOffset + i);
    const length = view.getUint32(0);
    const type = new TextDecoder().decode(bytes.slice(i + 4, i + 8));

    if (type === 'tEXt' || type === 'iTXt') {
      const dataStart = i + 8;
      let currentKeyword = '';
      let kEnd = dataStart;
      while (kEnd < dataStart + length && bytes[kEnd] !== 0) {
        currentKeyword += String.fromCharCode(bytes[kEnd]);
        kEnd++;
      }

      if (currentKeyword === 'ccv3') {
        const dataBytes = bytes.slice(kEnd + 1, dataStart + length);
        const textStr = new TextDecoder('utf-8').decode(dataBytes);
        try {
          ccv3Data = Buffer.from(textStr, 'base64').toString('utf-8');
          JSON.parse(ccv3Data);
        } catch {
          ccv3Data = textStr;
        }
      } else if (currentKeyword === 'chara') {
        const dataBytes = bytes.slice(kEnd + 1, dataStart + length);
        const textStr = new TextDecoder('utf-8').decode(dataBytes);
        try {
          charaData = Buffer.from(textStr, 'base64').toString('utf-8');
          JSON.parse(charaData);
        } catch {
          charaData = textStr;
        }
      }
    }
    i += 12 + length;
  }

  if (ccv3Data) return ccv3Data;
  if (charaData) return charaData;
  throw new Error('在 PNG 角色卡中未找到 chara 或 ccv3 元数据。');
}

function removeCharaChunks(pngBytes: Uint8Array): { cleanBytes: Uint8Array; header: Uint8Array } {
  const chunks: Uint8Array[] = [];
  const header = pngBytes.slice(0, 8);
  let i = 8;
  while (i < pngBytes.length) {
    if (i + 8 > pngBytes.length) break;
    const view = new DataView(pngBytes.buffer, pngBytes.byteOffset + i);
    const length = view.getUint32(0);
    const type = new TextDecoder().decode(pngBytes.slice(i + 4, i + 8));
    const totalLength = 12 + length;

    let shouldFilter = false;
    if (type === 'tEXt' || type === 'iTXt') {
      const dataStart = i + 8;
      let currentKeyword = '';
      let kEnd = dataStart;
      while (kEnd < dataStart + length && pngBytes[kEnd] !== 0) {
        currentKeyword += String.fromCharCode(pngBytes[kEnd]);
        kEnd++;
      }
      if (currentKeyword === 'chara' || currentKeyword === 'ccv3') {
        shouldFilter = true;
      }
    }

    if (!shouldFilter) {
      chunks.push(pngBytes.slice(i, i + totalLength));
    }
    i += totalLength;
  }

  const totalCleanLength = chunks.reduce((acc, c) => acc + c.length, 0);
  const cleanBytes = new Uint8Array(totalCleanLength);
  let offset = 0;
  for (const c of chunks) {
    cleanBytes.set(c, offset);
    offset += c.length;
  }
  return { cleanBytes, header };
}

export function embedDataInPng(originalBytes: Uint8Array, jsonText: string): Uint8Array {
  const { cleanBytes, header } = removeCharaChunks(originalBytes);

  let cardObj: any;
  try {
    cardObj = JSON.parse(jsonText);
  } catch (e) {
    cardObj = {};
  }
  
  // 获取数据核心 (兼容 flat 结构和嵌套结构)
  const rawData = cardObj.data || cardObj;

  // --- A. 构建完美的 V2 格式对象 (保证 requiredFields 都在) ---
  const v2Card: any = {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {}
  };

  v2Card.data.name = rawData.name || '';
  v2Card.data.description = rawData.description || '';
  v2Card.data.personality = rawData.personality || '';
  v2Card.data.scenario = rawData.scenario || '';
  v2Card.data.first_mes = rawData.first_mes || '';
  v2Card.data.mes_example = rawData.mes_example || '';
  v2Card.data.creator_notes = rawData.creator_notes || rawData.creatorcomment || '';
  v2Card.data.system_prompt = rawData.system_prompt || '';
  v2Card.data.post_history_instructions = rawData.post_history_instructions || '';
  v2Card.data.alternate_greetings = rawData.alternate_greetings || [];
  v2Card.data.tags = rawData.tags || [];
  v2Card.data.creator = rawData.creator || '';
  v2Card.data.character_version = rawData.character_version || '';

  // 深拷贝并净化扩展字段，确保正则脚本等扩展字段也同时保存在 V2 的 extensions 中
  v2Card.data.extensions = JSON.parse(JSON.stringify(rawData.extensions || {}));

  // 如果 V3 数据中存在 character_book，在 V2 中也需保存在 data.character_book 中以维持完整性
  if (rawData.character_book) {
    v2Card.data.character_book = JSON.parse(JSON.stringify(rawData.character_book));
  }

  // --- B. 构建完美的 V3 格式对象 ---
  const v3Card: any = {
    spec: 'chara_card_v3',
    spec_version: '3.0',
    data: JSON.parse(JSON.stringify(rawData)) // 直接深拷贝所有高级扩展属性
  };

  // --- C. 对两个对象进行 Base64 编码，生成各自的 PNG tEXt 块 ---
  const base64V2 = Buffer.from(JSON.stringify(v2Card), 'utf-8').toString('base64');
  const base64V3 = Buffer.from(JSON.stringify(v3Card), 'utf-8').toString('base64');

  const textEncoder = new TextEncoder();
  const encodedCharaText = textEncoder.encode('chara\x00' + base64V2);
  const encodedCcv3Text = textEncoder.encode('ccv3\x00' + base64V3);

  const chunkChara = createTextChunk('tEXt', encodedCharaText);
  const chunkCcv3 = createTextChunk('tEXt', encodedCcv3Text);

  // 寻找 IEND 块偏移量并合并拼装
  const iendOffset = cleanBytes.length - 12;
  if (iendOffset < 0) {
    throw new Error('无效的 PNG 文件：未找到 IEND 数据块。');
  }

  const newChunksLength = chunkChara.length + chunkCcv3.length;
  const finalBytes = new Uint8Array(8 + cleanBytes.length + newChunksLength);
  
  let offset = 0;
  finalBytes.set(header, offset);
  offset += 8;
  
  finalBytes.set(cleanBytes.slice(0, iendOffset), offset);
  offset += iendOffset;
  
  finalBytes.set(chunkChara, offset);
  offset += chunkChara.length;
  
  finalBytes.set(chunkCcv3, offset);
  offset += chunkCcv3.length;
  
  finalBytes.set(cleanBytes.slice(iendOffset), offset);

  return finalBytes;
}


// --- Unified Transparent File Read / Write Interceptors ---

export async function readTextFile(filePath: string): Promise<string> {
  if (filePath.endsWith('.png')) {
    try {
      const originalBytes = new Uint8Array(await readFile(filePath));
      const jsonText = extractDataFromPng(originalBytes);
      // 强制美化排版以配合 Monaco 的默认格式化并防止正则回溯报错
      return JSON.stringify(JSON.parse(jsonText), null, 4);
    } catch (err: any) {
      // 触发防呆保底：如果是假 PNG（实为文本 JSON）或原 PNG 缺失，我们尝试找同名 .json 文件或直接用 utf-8 强行读取
      try {
        const jsonPath = filePath.replace(/\.png$/, '.json');
        return await readFile(jsonPath, 'utf-8');
      } catch {
        try {
          return await readFile(filePath, 'utf-8');
        } catch {
          throw err;
        }
      }
    }
  }
  try {
    return await readFile(filePath, 'utf-8');
  } catch (err: any) {
    if (err.code === 'ENOENT' && filePath.endsWith('stscript-reference.md')) {
      try {
        const { resolve } = await import('path');
        const fallbackPath = resolve(import.meta.dir, '../stscript-reference.md');
        return await readFile(fallbackPath, 'utf-8');
      } catch {
        throw err;
      }
    }
    throw err;
  }
}

export async function writeTextFile(filePath: string, content: string): Promise<void> {
  if (filePath.endsWith('.png')) {
    try {
      const originalBytes = new Uint8Array(await readFile(filePath));
      const newPngBytes = embedDataInPng(originalBytes, content);
      await writeFile(filePath, newPngBytes);
      return;
    } catch (err: any) {
      // 如果原 PNG 文件不存在，为了防呆，自动转存为同名且无二进制障碍 of .json 开发副本
      if (err.code === 'ENOENT' || err.message.includes('IEND') || err.message.includes('元数据')) {
        const jsonPath = filePath.replace(/\.png$/, '.json');
        await writeFile(jsonPath, content, 'utf-8');
        return;
      }
      throw err;
    }
  }
  await writeFile(filePath, content, 'utf-8');
}

