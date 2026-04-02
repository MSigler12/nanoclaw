// ---------------------------------------------------------------------------
// PDF Converter — DOCX → PDF via LibreOffice headless
//
// LibreOffice is the only tool that faithfully renders Word styles to PDF.
// No HTML intermediates, no Chromium workarounds.
// ---------------------------------------------------------------------------

import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execFileAsync = promisify(execFile);

/**
 * Convert a .docx file to PDF using LibreOffice headless.
 * The PDF is written to the same directory with the same basename.
 *
 * @param docxPath - Absolute path to the .docx file
 * @returns Absolute path to the generated .pdf file
 * @throws If LibreOffice exits non-zero or the input file doesn't exist
 */
export async function convertToPdf(docxPath: string): Promise<string> {
  const resolved = path.resolve(docxPath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`DOCX file not found: ${resolved}`);
  }

  const outDir = path.dirname(resolved);

  await execFileAsync('libreoffice', [
    '--headless',
    '--norestore',
    '--convert-to',
    'pdf',
    '--outdir',
    outDir,
    resolved,
  ]);

  const pdfPath = path.join(
    outDir,
    path.basename(resolved, path.extname(resolved)) + '.pdf',
  );

  if (!fs.existsSync(pdfPath)) {
    throw new Error(
      `PDF conversion completed but output file not found: ${pdfPath}`,
    );
  }

  return pdfPath;
}
