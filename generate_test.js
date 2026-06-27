import { config } from 'dotenv';
config();
import { assemblePackage } from './src/contextforge/assembler.ts';

async function run() {
  const spec = {
    id: 'test-123',
    projectName: 'offline-code-reviewer',
    platform: 'node-cli',
    description: 'A fully offline code review engine that parses source code into an AST using tree-sitter, detects programming concepts, and stores skill profiles in SQLite.',
    stack: {
      database: { value: 'better-sqlite3', source: 'user' },
      parser: { value: 'tree-sitter', source: 'user' }
    },
    features: ['ast-parser', 'concept-detection', 'skill-profiler'],
    requiredCategories: ['database', 'parser'],
    projectSpecVersion: '1.0.0',
    constraints: { technical: { mustBeOffline: true } }
  };
  
  console.log("Starting generation...");
  const { files } = await assemblePackage(spec);
  
  const fs = require('fs');
  fs.writeFileSync('test-output.json', JSON.stringify(files, null, 2));
  
  console.log("Checking deliverables...");
  console.log("Guide missing raw syntax: " + !files['context-manifests/ast-parser-guide.md'].includes('${contextList}'));
  console.log("Prompt has paths: " + files['prompts/ast-parser/concept-detection.md'].includes('src/'));
  console.log("Prompt > 500 chars: " + (files['prompts/ast-parser/concept-detection.md'].length > 500));
  console.log("Prompt has checkbox: " + files['prompts/ast-parser/concept-detection.md'].includes('- [ ]'));
  console.log("Install script has tree-sitter: " + files['setup/install.sh'].includes('npm install tree-sitter'));
  console.log("Done.");
}

run().catch(console.error);
