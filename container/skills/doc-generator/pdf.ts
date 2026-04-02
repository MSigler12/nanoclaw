#!/usr/bin/env npx tsx
// ---------------------------------------------------------------------------
// CLI entry point — PDF conversion
//
// Usage: npx tsx pdf.ts <input.docx>
// Output: prints the PDF path to stdout
// ---------------------------------------------------------------------------

import { convertToPdf } from './pdf-convert.js';

async function main(): Promise<void> {
  const docxPath = process.argv[2];

  if (!docxPath) {
    console.error('Usage: npx tsx pdf.ts <input.docx>');
    process.exit(1);
  }

  const pdfPath = await convertToPdf(docxPath);
  console.log(pdfPath);
}

main().catch((err) => {
  console.error('PDF conversion failed:', err);
  process.exit(1);
});
