#!/usr/bin/env npx tsx
// ---------------------------------------------------------------------------
// CLI entry point — DOCX generation
//
// Usage: npx tsx generate.ts <input.json> <output.docx>
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';
import { generateDocument } from './generator.js';
import type { DocumentInput } from './types.js';

async function main(): Promise<void> {
  const [inputPath, outputPath] = process.argv.slice(2);

  if (!inputPath || !outputPath) {
    console.error('Usage: npx tsx generate.ts <input.json> <output.docx>');
    process.exit(1);
  }

  const resolvedInput = path.resolve(inputPath);
  const resolvedOutput = path.resolve(outputPath);

  if (!fs.existsSync(resolvedInput)) {
    console.error(`Input file not found: ${resolvedInput}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(resolvedInput, 'utf-8');
  let input: DocumentInput;
  try {
    input = JSON.parse(raw) as DocumentInput;
  } catch {
    console.error('Failed to parse input JSON');
    process.exit(1);
  }

  // Ensure output directory exists
  fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });

  const buffer = await generateDocument(input);
  fs.writeFileSync(resolvedOutput, buffer);

  console.log(resolvedOutput);
}

main().catch((err) => {
  console.error('Document generation failed:', err);
  process.exit(1);
});
