// ---------------------------------------------------------------------------
// The Cottano Group — Brand Spec v1.1 (March 2026)
//
// Single source of truth for all brand values. No docx imports here —
// just primitives. styles.ts consumes these to build Word style definitions.
//
// CORRECTIONS from v1.1:
//   - Primary navy is 1B2A4A (NOT 1B3A5C)
//   - No orange accent — removed from brand
//   - Accent color is Cottano Slate 5A6A7A
//   - Deep navy 071A2D is logo marks and darkest backgrounds only
// ---------------------------------------------------------------------------

// --- Colors (bare hex — docx package convention, no # prefix) ---

export const COLORS = {
  /** Section headers, H1 fills, table headers, cover pages */
  NAVY_PRIMARY: '1B2A4A',
  /** Cover title text, logo contexts only */
  NAVY_DEEP: '071A2D',
  /** Accent bars, dividers, H3 underlines */
  SLATE: '5A6A7A',
  /** Body text, H2 fills, H4 text */
  DARK_SLATE: '1E293B',
  /** Captions, footer text, metadata */
  STEEL_GRAY: '8B95A5',
  /** Alternate table rows */
  LIGHT_PANEL: 'F1F5F9',
  WHITE: 'FFFFFF',
} as const;

// --- Typography ---

export const FONTS = {
  /** All headings, table headers, cover titles */
  HEADING: 'Trebuchet MS',
  /** All body text, table cells, captions, headers/footers */
  BODY: 'Calibri',
} as const;

// --- Type sizes (half-points — docx convention: 24 half-pts = 12pt) ---

export const SIZES = {
  COVER_TITLE: 56,   // 28pt
  H1: 36,            // 18pt
  H2: 26,            // 13pt
  H3: 22,            // 11pt
  H4: 21,            // 10.5pt
  BODY: 21,          // 10.5pt
  TABLE_HEADER: 19,  // 9.5pt
  TABLE_BODY: 19,    // 9.5pt
  CAPTION: 17,       // 8.5pt
  HEADER: 17,        // 8.5pt
  FOOTER: 16,        // 8pt
} as const;

// --- Spacing (twips — visual points × 20) ---

export const SPACING = {
  H3_BEFORE: 4000,   // 200pt
  H3_AFTER: 1200,    // 60pt
  H4_BEFORE: 3200,   // 160pt
  H4_AFTER: 1200,    // 60pt
  BODY_BEFORE: 1200, // 60pt
  BODY_AFTER: 1600,  // 80pt
} as const;

// --- Margins (EMU — 1 inch = 914400 EMU) ---

export const MARGINS = {
  TOP: 914400,       // 1"
  BOTTOM: 914400,    // 1"
  LEFT: 685800,      // 0.75"
  RIGHT: 685800,     // 0.75"
} as const;

// --- Header / Footer ---

export const HEADER = {
  COMPANY_NAME: 'The Cottano Group',
  /** Slate bottom border thickness in half-points (4pt = 8 half-pts) */
  BORDER_SIZE: 8,
} as const;
