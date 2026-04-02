// ---------------------------------------------------------------------------
// Document Generator — assembles a complete .docx from DocumentInput
//
// Takes structured content, applies brand styles, returns a Buffer.
// No side effects — the caller decides where to write the file.
// ---------------------------------------------------------------------------

import {
  Document,
  Packer,
  PageBreak,
  Paragraph,
  TextRun,
} from 'docx';

import type { DocumentInput } from './types.js';
import {
  getDocumentStyles,
  getSectionProperties,
  buildTable,
  buildCoverPage,
  NUMBERING_CONFIG,
} from './styles.js';

// ---------------------------------------------------------------------------
// Heading style ID lookup
// ---------------------------------------------------------------------------

const HEADING_STYLE: Record<1 | 2 | 3 | 4, string> = {
  1: 'Heading1',
  2: 'Heading2',
  3: 'Heading3',
  4: 'Heading4',
};

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Generate a branded .docx document from structured input.
 * Returns a Buffer containing the complete Word file.
 */
export async function generateDocument(
  input: DocumentInput,
): Promise<Buffer> {
  const styles = getDocumentStyles();
  const sectionProps = getSectionProperties(
    input.title,
    input.classificationLabel,
  );

  // Assemble all children (Paragraphs and Tables)
  const children: (Paragraph | ReturnType<typeof buildTable>)[] = [];

  // Cover page
  if (input.coverPage) {
    const coverParagraphs = buildCoverPage(input.coverPage);
    children.push(...coverParagraphs);
    // Page break after cover
    children.push(new Paragraph({ children: [new PageBreak()] }));
  }

  // Body sections
  for (const section of input.sections) {
    // Page break
    if (section.pageBreakBefore) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }

    // Heading
    if (section.heading) {
      children.push(
        new Paragraph({
          style: HEADING_STYLE[section.headingLevel],
          children: [new TextRun({ text: section.heading })],
        }),
      );
    }

    // Body paragraphs
    if (section.content) {
      const blocks = section.content.split('\n\n').filter((b) => b.trim());
      for (const block of blocks) {
        children.push(
          new Paragraph({
            style: 'BodyText',
            children: [new TextRun({ text: block.trim() })],
          }),
        );
      }
    }

    // Bullet items
    if (section.bullets) {
      for (const item of section.bullets) {
        children.push(
          new Paragraph({
            style: 'BulletText',
            children: [new TextRun({ text: item })],
          }),
        );
      }
    }

    // Table
    if (section.table) {
      children.push(buildTable(section.table));

      // Caption
      if (section.table.caption) {
        children.push(
          new Paragraph({
            style: 'CaptionText',
            children: [new TextRun({ text: section.table.caption })],
          }),
        );
      }
    }
  }

  // Assemble document
  const doc = new Document({
    creator: input.author || 'The Cottano Group',
    title: input.title,
    description: input.subtitle,
    styles,
    numbering: NUMBERING_CONFIG,
    sections: [
      {
        ...sectionProps,
        children,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
