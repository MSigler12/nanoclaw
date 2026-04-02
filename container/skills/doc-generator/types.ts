// ---------------------------------------------------------------------------
// Document Generator — Input Schema
//
// The agent assembles these objects. The generator handles all styling.
// No brand values (colors, fonts, sizes) appear here — only content.
// ---------------------------------------------------------------------------

export interface DocumentInput {
  /** Document title (used in header and metadata) */
  title: string;
  subtitle?: string;
  /** Client identifier, e.g. "CTG-2026-041" */
  clientCode?: string;
  /** Footer classification: CONFIDENTIAL | INTERNAL | DRAFT | FINAL */
  classificationLabel: string;
  /** ISO date string, defaults to today */
  date?: string;
  /** Author name, defaults to "The Cottano Group" */
  author?: string;
  /** Cover page — omit for memos/briefs */
  coverPage?: CoverPage;
  /** Document body — ordered array of content blocks */
  sections: Section[];
}

export interface CoverPage {
  /** Large cover title */
  title: string;
  subtitle?: string;
  /** Client or recipient name */
  preparedFor?: string;
  /** Author or team name */
  preparedBy?: string;
  /** Display date on cover */
  date?: string;
}

export interface Section {
  /** Section heading text */
  heading?: string;
  /** Heading level: 1 = major section, 2 = subsection, 3–4 = detail */
  headingLevel: 1 | 2 | 3 | 4;
  /** Body text — paragraphs separated by \n\n */
  content?: string;
  /** Bullet list items — one string per bullet */
  bullets?: string[];
  /** Optional table */
  table?: TableData;
  /** Force a page break before this section */
  pageBreakBefore?: boolean;
}

export interface TableData {
  /** Column header labels */
  headers: string[];
  /** Row data — each row is an array of cell strings */
  rows: string[][];
  /** Optional caption displayed below the table */
  caption?: string;
  /** Autofit table to window width (default: true) */
  autofit?: boolean;
}
