// ---------------------------------------------------------------------------
// Document Styles — builds docx style definitions from brand constants
//
// Consumes brand.ts, produces docx objects. The generator calls these
// functions — it never references brand values directly.
// ---------------------------------------------------------------------------

import {
  AlignmentType,
  BorderStyle,
  Footer,
  Header,
  HeadingLevel,
  LevelFormat,
  Paragraph,
  PageNumber,
  ShadingType,
  Tab,
  TabStopPosition,
  TabStopType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  convertInchesToTwip,
  type IStylesOptions,
  type ISectionOptions,
} from 'docx';

import { COLORS, FONTS, SIZES, SPACING, MARGINS, HEADER } from './brand.js';
import type { TableData, CoverPage } from './types.js';

// ---------------------------------------------------------------------------
// Numbering definitions (bullets)
// ---------------------------------------------------------------------------

export const NUMBERING_CONFIG = {
  config: [
    {
      reference: 'cottano-bullets',
      levels: [
        {
          level: 0,
          format: LevelFormat.BULLET,
          text: '\u2022',
          alignment: AlignmentType.LEFT,
          style: {
            paragraph: {
              indent: {
                left: convertInchesToTwip(0.5),
                hanging: convertInchesToTwip(0.25),
              },
            },
          },
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Paragraph styles
// ---------------------------------------------------------------------------

export function getDocumentStyles(): IStylesOptions {
  return {
    paragraphStyles: [
      {
        id: 'CoverTitle',
        name: 'Cover Title',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: {
          font: FONTS.HEADING,
          size: SIZES.COVER_TITLE,
          bold: true,
          color: COLORS.NAVY_DEEP,
        },
        paragraph: {
          spacing: { after: 400 },
        },
      },
      {
        id: 'CoverSubtitle',
        name: 'Cover Subtitle',
        basedOn: 'Normal',
        next: 'Normal',
        run: {
          font: FONTS.HEADING,
          size: SIZES.H2,
          color: COLORS.SLATE,
        },
        paragraph: {
          spacing: { after: 200 },
        },
      },
      {
        id: 'CoverMeta',
        name: 'Cover Meta',
        basedOn: 'Normal',
        next: 'Normal',
        run: {
          font: FONTS.BODY,
          size: SIZES.BODY,
          color: COLORS.DARK_SLATE,
        },
        paragraph: {
          spacing: { after: 120 },
        },
      },
      // --- Heading 1: White on Navy Primary fill ---
      {
        id: 'Heading1',
        name: 'Heading 1',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: {
          font: FONTS.HEADING,
          size: SIZES.H1,
          bold: true,
          color: COLORS.WHITE,
        },
        paragraph: {
          shading: {
            type: ShadingType.CLEAR,
            color: 'auto',
            fill: COLORS.NAVY_PRIMARY,
          },
          spacing: { before: 240, after: 120 },
        },
      },
      // --- Heading 2: White on Dark Slate fill ---
      {
        id: 'Heading2',
        name: 'Heading 2',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: {
          font: FONTS.HEADING,
          size: SIZES.H2,
          bold: true,
          color: COLORS.WHITE,
        },
        paragraph: {
          shading: {
            type: ShadingType.CLEAR,
            color: 'auto',
            fill: COLORS.DARK_SLATE,
          },
          spacing: { before: 240, after: 120 },
        },
      },
      // --- Heading 3: Navy Primary, slate underline ---
      {
        id: 'Heading3',
        name: 'Heading 3',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: {
          font: FONTS.HEADING,
          size: SIZES.H3,
          bold: true,
          color: COLORS.NAVY_PRIMARY,
        },
        paragraph: {
          border: {
            bottom: {
              color: COLORS.SLATE,
              space: 1,
              style: BorderStyle.SINGLE,
              size: 6,
            },
          },
          spacing: { before: SPACING.H3_BEFORE, after: SPACING.H3_AFTER },
        },
      },
      // --- Heading 4: Dark Slate, no fill ---
      {
        id: 'Heading4',
        name: 'Heading 4',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: {
          font: FONTS.HEADING,
          size: SIZES.H4,
          bold: true,
          color: COLORS.DARK_SLATE,
        },
        paragraph: {
          spacing: { before: SPACING.H4_BEFORE, after: SPACING.H4_AFTER },
        },
      },
      // --- Body ---
      {
        id: 'BodyText',
        name: 'Body Text',
        basedOn: 'Normal',
        next: 'BodyText',
        quickFormat: true,
        run: {
          font: FONTS.BODY,
          size: SIZES.BODY,
          color: COLORS.DARK_SLATE,
        },
        paragraph: {
          alignment: AlignmentType.JUSTIFIED,
          spacing: { before: SPACING.BODY_BEFORE, after: SPACING.BODY_AFTER },
        },
      },
      // --- Bullet ---
      {
        id: 'BulletText',
        name: 'Bullet Text',
        basedOn: 'Normal',
        next: 'BulletText',
        run: {
          font: FONTS.BODY,
          size: SIZES.BODY,
          color: COLORS.DARK_SLATE,
        },
        paragraph: {
          numbering: {
            reference: 'cottano-bullets',
            level: 0,
          },
          spacing: { before: 60, after: 60 },
        },
      },
      // --- Caption ---
      {
        id: 'CaptionText',
        name: 'Caption Text',
        basedOn: 'Normal',
        next: 'Normal',
        run: {
          font: FONTS.BODY,
          size: SIZES.CAPTION,
          italics: true,
          color: COLORS.STEEL_GRAY,
        },
        paragraph: {
          spacing: { before: 60, after: 200 },
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Section properties (margins, header, footer)
// ---------------------------------------------------------------------------

export function getSectionProperties(
  title: string,
  classificationLabel: string,
): Omit<ISectionOptions, 'children'> {
  return {
    properties: {
      page: {
        margin: {
          top: MARGINS.TOP,
          bottom: MARGINS.BOTTOM,
          left: MARGINS.LEFT,
          right: MARGINS.RIGHT,
        },
      },
    },
    headers: {
      default: new Header({
        children: [
          new Paragraph({
            border: {
              bottom: {
                color: COLORS.SLATE,
                space: 1,
                style: BorderStyle.SINGLE,
                size: HEADER.BORDER_SIZE,
              },
            },
            tabStops: [
              {
                type: TabStopType.RIGHT,
                position: TabStopPosition.MAX,
              },
            ],
            children: [
              new TextRun({
                text: HEADER.COMPANY_NAME,
                font: FONTS.HEADING,
                size: SIZES.HEADER,
                bold: true,
                color: COLORS.NAVY_PRIMARY,
              }),
              new TextRun({
                children: [new Tab()],
              }),
              new TextRun({
                text: title,
                font: FONTS.BODY,
                size: SIZES.HEADER,
                color: COLORS.STEEL_GRAY,
              }),
            ],
          }),
        ],
      }),
    },
    footers: {
      default: new Footer({
        children: [
          new Paragraph({
            tabStops: [
              {
                type: TabStopType.RIGHT,
                position: TabStopPosition.MAX,
              },
            ],
            children: [
              new TextRun({
                text: classificationLabel,
                font: FONTS.BODY,
                size: SIZES.FOOTER,
                color: COLORS.STEEL_GRAY,
              }),
              new TextRun({
                children: [new Tab()],
              }),
              new TextRun({
                text: 'Page ',
                font: FONTS.BODY,
                size: SIZES.FOOTER,
                color: COLORS.STEEL_GRAY,
              }),
              new TextRun({
                children: [PageNumber.CURRENT],
                font: FONTS.BODY,
                size: SIZES.FOOTER,
                color: COLORS.STEEL_GRAY,
              }),
            ],
          }),
        ],
      }),
    },
  };
}

// ---------------------------------------------------------------------------
// Table builder
// ---------------------------------------------------------------------------

export function buildTable(data: TableData): Table {
  const headerRow = new TableRow({
    tableHeader: true,
    children: data.headers.map(
      (h) =>
        new TableCell({
          shading: {
            type: ShadingType.CLEAR,
            color: 'auto',
            fill: COLORS.NAVY_PRIMARY,
          },
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: h,
                  font: FONTS.HEADING,
                  size: SIZES.TABLE_HEADER,
                  bold: true,
                  color: COLORS.WHITE,
                }),
              ],
            }),
          ],
        }),
    ),
  });

  const bodyRows = data.rows.map(
    (row, rowIdx) =>
      new TableRow({
        children: row.map(
          (cell) =>
            new TableCell({
              // Alternate row shading
              ...(rowIdx % 2 === 1
                ? {
                    shading: {
                      type: ShadingType.CLEAR,
                      color: 'auto',
                      fill: COLORS.LIGHT_PANEL,
                    },
                  }
                : {}),
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: cell,
                      font: FONTS.BODY,
                      size: SIZES.TABLE_BODY,
                      color: COLORS.DARK_SLATE,
                    }),
                  ],
                }),
              ],
            }),
        ),
      }),
  );

  return new Table({
    width:
      data.autofit !== false
        ? { size: 100, type: WidthType.PERCENTAGE }
        : undefined,
    rows: [headerRow, ...bodyRows],
  });
}

// ---------------------------------------------------------------------------
// Cover page builder
// ---------------------------------------------------------------------------

export function buildCoverPage(cover: CoverPage): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  // Vertical spacing before title
  paragraphs.push(
    new Paragraph({ spacing: { before: 6000 } }),
  );

  // Title
  paragraphs.push(
    new Paragraph({
      style: 'CoverTitle',
      children: [new TextRun({ text: cover.title })],
    }),
  );

  // Subtitle
  if (cover.subtitle) {
    paragraphs.push(
      new Paragraph({
        style: 'CoverSubtitle',
        children: [new TextRun({ text: cover.subtitle })],
      }),
    );
  }

  // Spacer
  paragraphs.push(new Paragraph({ spacing: { before: 2000 } }));

  // Prepared for
  if (cover.preparedFor) {
    paragraphs.push(
      new Paragraph({
        style: 'CoverMeta',
        children: [
          new TextRun({ text: 'Prepared for: ', bold: true }),
          new TextRun({ text: cover.preparedFor }),
        ],
      }),
    );
  }

  // Prepared by
  if (cover.preparedBy) {
    paragraphs.push(
      new Paragraph({
        style: 'CoverMeta',
        children: [
          new TextRun({ text: 'Prepared by: ', bold: true }),
          new TextRun({ text: cover.preparedBy }),
        ],
      }),
    );
  }

  // Date
  if (cover.date) {
    paragraphs.push(
      new Paragraph({
        style: 'CoverMeta',
        children: [
          new TextRun({ text: 'Date: ', bold: true }),
          new TextRun({ text: cover.date }),
        ],
      }),
    );
  }

  return paragraphs;
}
