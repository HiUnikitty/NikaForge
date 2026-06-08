// NikaForge Backend - FileEditTool
// Ported from Claude Code's tools/FileEditTool/FileEditTool.ts
// Key feature: findActualString() fuzzy matching from utils.ts

import { mkdir } from 'fs/promises';
import { readTextFile, writeTextFile } from '../pngHelper';
import { resolve, dirname } from 'path';
import type { Tool, ToolInput, ToolResult, ToolContext } from '../engine/types';

/**
 * Core fuzzy matching from Claude Code's FileEditTool/utils.ts
 * Handles quote normalization (smart quotes ↔ straight quotes)
 */
function findActualString(fileContent: string, searchString: string): string | null {
  // Direct match
  if (fileContent.includes(searchString)) return searchString;

  // Try normalizing line endings
  const normalizedSearch = searchString.replace(/\r\n/g, '\n');
  const normalizedFile = fileContent.replace(/\r\n/g, '\n');
  if (normalizedFile.includes(normalizedSearch)) return normalizedSearch;

  // Try normalizing quotes (smart quotes → straight quotes)
  const quoteNormalized = normalizedSearch
    .replace(/[\u2018\u2019]/g, "'")  // Smart single quotes
    .replace(/[\u201C\u201D]/g, '"'); // Smart double quotes
  if (normalizedFile.includes(quoteNormalized)) return quoteNormalized;

  // Try the reverse: straight → smart (if file uses smart quotes)
  const smartQuoted = normalizedSearch
    .replace(/'/g, '\u2019')
    .replace(/"/g, '\u201D');
  if (normalizedFile.includes(smartQuoted)) return smartQuoted;

  // Try trimming trailing whitespace from each line
  const trimmedSearch = normalizedSearch
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n');
  const trimmedFile = normalizedFile
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n');
  if (trimmedFile.includes(trimmedSearch)) {
    // Find the original substring with the actual whitespace
    const idx = trimmedFile.indexOf(trimmedSearch);
    // Map index back to original file to get exact match
    return normalizedFile.split('\n').slice(
      trimmedFile.substring(0, idx).split('\n').length - 1
    ).join('\n').substring(0, searchString.length) || searchString;
  }

  return null;
}

export const FileEditTool: Tool = {
  name: 'Edit',
  description: 'Edits a file by replacing old_string with new_string. Supports single replacement or multiple replacement chunks via the "edits" parameter. The old_string must match exactly (or be fuzzy-matched). For creating new files, use empty old_string.',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: 'File path to edit' },
      old_string: { type: 'string', description: 'The exact text to find and replace. Empty string for new file creation. (Required if "edits" is not provided)' },
      new_string: { type: 'string', description: 'The replacement text. (Required if "edits" is not provided)' },
      replace_all: { type: 'string', description: 'Set to "true" to replace all occurrences (default: false)' },
      edits: {
        type: 'array',
        description: 'Optional array of multiple edits to perform sequentially on the same file.',
        items: {
          type: 'object',
          properties: {
            old_string: { type: 'string', description: 'The exact text to find' },
            new_string: { type: 'string', description: 'The replacement text' },
            replace_all: { type: 'string', description: 'Set to "true" to replace all occurrences' }
          },
          required: ['old_string', 'new_string']
        }
      }
    },
    required: ['file_path'],
  },

  async call(input: ToolInput, context: ToolContext): Promise<ToolResult> {
    const filePath = resolve(context.cwd, (input.file_path || input.path) as string);
    const rawEdits: any[] = [];

    if (Array.isArray(input.edits)) {
      rawEdits.push(...input.edits);
    } else if (input.old_string !== undefined && input.new_string !== undefined) {
      rawEdits.push({
        old_string: input.old_string as string,
        new_string: input.new_string as string,
        replace_all: input.replace_all
      });
    } else {
      return { success: false, output: '', error: 'Either (old_string and new_string) or "edits" array must be provided.' };
    }

    try {
      let fileContent: string;
      let isNewFile = false;

      try {
        fileContent = (await readTextFile(filePath)).replace(/\r\n/g, '\n');
      } catch (err: any) {
        // If we are creating a new file, it must be a single edit with empty old_string
        const isSingleNewFile = rawEdits.length === 1 && rawEdits[0].old_string === '';
        if (err.code === 'ENOENT' && isSingleNewFile) {
          isNewFile = true;
          fileContent = '';
        } else if (err.code === 'ENOENT') {
          return { success: false, output: '', error: `File not found: ${filePath}` };
        } else {
          throw err;
        }
      }

      // Track file history for rewind
      if (!context.fileHistory.has(filePath)) {
        context.fileHistory.set(filePath, []);
      }
      context.fileHistory.get(filePath)!.push({
        content: fileContent,
        timestamp: Date.now(),
      });

      let currentContent = fileContent;
      const appliedEdits: Array<{ oldString: string, newString: string }> = [];

      for (let i = 0; i < rawEdits.length; i++) {
        const edit = rawEdits[i];
        const oldStr = (edit.old_string as string).replace(/\r\n/g, '\n');
        const newStr = (edit.new_string as string).replace(/\r\n/g, '\n');
        const repAll = edit.replace_all === true || edit.replace_all === 'true';

        if (oldStr === '' && (isNewFile || fileContent.trim() === '')) {
          if (rawEdits.length === 1) {
            currentContent = newStr;
          } else {
            return {
              success: false,
              output: '',
              error: `Edit #${i + 1} failed: Empty old_string is only supported for single file creation/overwrite edits.`,
            };
          }
        } else {
          const actualOld = findActualString(currentContent, oldStr);
          if (!actualOld) {
            return {
              success: false,
              output: '',
              error: `Edit #${i + 1} failed: String to replace not found in file.\nSearched for:\n${oldStr.substring(0, 200)}${oldStr.length > 200 ? '...' : ''}`,
            };
          }

          const occurrences = currentContent.split(actualOld).length - 1;
          if (occurrences > 1 && !repAll) {
            return {
              success: false,
              output: '',
              error: `Edit #${i + 1} failed: Found ${occurrences} matches of old_string. Set replace_all=true to replace all, or provide more context.`,
            };
          }

          currentContent = repAll
            ? currentContent.replaceAll(actualOld, () => newStr)
            : currentContent.replace(actualOld, () => newStr);
        }
        appliedEdits.push({ oldString: oldStr, newString: newStr });
      }

      const updatedContent = currentContent;

      // Ensure directory exists
      await mkdir(dirname(filePath), { recursive: true });

      // Write file
      await writeTextFile(filePath, updatedContent);

      // Update read state
      context.readFileState.set(filePath, {
        content: updatedContent,
        timestamp: Date.now(),
      });

      const action = isNewFile ? 'Created' : 'Edited';
      const detail = rawEdits.length > 1 ? ` (${rawEdits.length} replacement chunks applied)` : '';
      return {
        success: true,
        output: `${action} file: ${(input.file_path || input.path) as string}${detail}`,
      };
    } catch (err: any) {
      return { success: false, output: '', error: err.message };
    }
  },
};
