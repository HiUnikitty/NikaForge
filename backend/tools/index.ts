// NikaForge Backend - Tool Registry
// All available tools exported as a single array

import { BashTool } from './BashTool';
import { FileReadTool } from './FileReadTool';
import { FileEditTool } from './FileEditTool';
import { FileWriteTool } from './FileWriteTool';
import { GrepTool } from './GrepTool';
import { GlobTool } from './GlobTool';
import { ReadCodeBlockTool } from './ReadCodeBlockTool';
import { EditCodeBlockTool } from './EditCodeBlockTool';
import { WriteCodeBlockTool } from './WriteCodeBlockTool';
import { CreateCharacterTool } from './CreateCharacterTool';
import { CheckCodeBlockTool } from './CheckCodeBlockTool';
import { GrepCodeBlockTool } from './GrepCodeBlockTool';
import { InjectTemplateTool } from './InjectTemplateTool';
import type { Tool } from '../engine/types';

export const ALL_TOOLS: Tool[] = [
  BashTool,
  FileReadTool,
  FileEditTool,
  FileWriteTool,
  GrepTool,
  GlobTool,
  ReadCodeBlockTool,
  EditCodeBlockTool,
  WriteCodeBlockTool,
  CreateCharacterTool,
  CheckCodeBlockTool,
  GrepCodeBlockTool,
  InjectTemplateTool,
];

export {
  BashTool,
  FileReadTool,
  FileEditTool,
  FileWriteTool,
  GrepTool,
  GlobTool,
  ReadCodeBlockTool,
  EditCodeBlockTool,
  WriteCodeBlockTool,
  CreateCharacterTool,
  CheckCodeBlockTool,
  GrepCodeBlockTool,
  InjectTemplateTool,
};
