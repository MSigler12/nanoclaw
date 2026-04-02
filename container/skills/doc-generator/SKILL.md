---
name: doc-generator
description: Generate branded Cottano Group documents (.docx and .pdf) from structured content
allowed-tools: Bash(npx tsx *)
---

# Document Generator

Generate professionally branded Word documents for The Cottano Group. All styling is handled automatically by the generator — you provide only content and structure. Never specify colors, fonts, or sizes in your input.

## When to Use

Use this skill when a task produces a professional deliverable: coverage analyses, client briefs, compliance summaries, audit reports, policy reviews, or any document going to a client or stakeholder.

Do NOT use for internal notes, scratchpads, conversation summaries, or quick answers.

## How to Generate a Document

### Step 1: Assemble the input JSON

Create a JSON file matching this schema:

```json
{
  "title": "Document Title",
  "subtitle": "Optional Subtitle",
  "clientCode": "CTG-2026-041",
  "classificationLabel": "CONFIDENTIAL",
  "date": "2026-04-01",
  "author": "The Cottano Group",
  "coverPage": {
    "title": "Full Cover Title",
    "subtitle": "Cover Subtitle",
    "preparedFor": "Client Name",
    "preparedBy": "The Cottano Group",
    "date": "April 1, 2026"
  },
  "sections": [
    {
      "heading": "Executive Summary",
      "headingLevel": 1,
      "content": "First paragraph of body text.\n\nSecond paragraph of body text."
    },
    {
      "heading": "Key Findings",
      "headingLevel": 2,
      "bullets": [
        "Finding one with supporting detail",
        "Finding two with supporting detail",
        "Finding three with supporting detail"
      ]
    },
    {
      "heading": "Coverage Matrix",
      "headingLevel": 2,
      "table": {
        "headers": ["Service", "NCD", "LCD", "Status"],
        "rows": [
          ["Physical Therapy", "NCD 150.1", "L35021", "Active"],
          ["DME - Wheelchairs", "NCD 280.1", "L33792", "Under Review"]
        ],
        "caption": "Table 1: Medicare Coverage Status Summary"
      }
    },
    {
      "heading": "Detailed Analysis",
      "headingLevel": 1,
      "pageBreakBefore": true,
      "content": "This section begins on a new page."
    }
  ]
}
```

### Step 2: Generate the DOCX

```bash
npx tsx /home/node/.claude/skills/doc-generator/generate.ts input.json /workspace/group/docs/output.docx
```

The command prints the output path on success.

### Step 3: Convert to PDF (optional, on-demand only)

```bash
npx tsx /home/node/.claude/skills/doc-generator/pdf.ts /workspace/group/docs/output.docx
```

The command prints the PDF path on success. Requires LibreOffice.

### Step 4: Notify the user

Always use `send_message` to tell the user the document is ready and where to find it.

## Input Schema Reference

### DocumentInput (required fields marked with *)

| Field | Type | Description |
|-------|------|-------------|
| title* | string | Document title (appears in header) |
| subtitle | string | Optional subtitle |
| clientCode | string | Client identifier, e.g. "CTG-2026-041" |
| classificationLabel* | string | CONFIDENTIAL, INTERNAL, DRAFT, or FINAL |
| date | string | ISO date, defaults to today |
| author | string | Defaults to "The Cottano Group" |
| coverPage | CoverPage | Omit for memos/briefs |
| sections* | Section[] | Document body |

### Section

| Field | Type | Description |
|-------|------|-------------|
| heading | string | Section heading text |
| headingLevel* | 1-4 | 1 = major section, 2 = subsection, 3-4 = detail |
| content | string | Body paragraphs separated by \n\n |
| bullets | string[] | Bullet list items, one per string |
| table | TableData | Optional table |
| pageBreakBefore | boolean | Force page break before this section |

### TableData

| Field | Type | Description |
|-------|------|-------------|
| headers* | string[] | Column header labels |
| rows* | string[][] | Row data |
| caption | string | Caption below table |
| autofit | boolean | Autofit to window (default: true) |

### CoverPage

| Field | Type | Description |
|-------|------|-------------|
| title* | string | Large cover title |
| subtitle | string | Cover subtitle |
| preparedFor | string | Client or recipient |
| preparedBy | string | Author or team |
| date | string | Display date |

## Guidelines

- Use headingLevel 1 for major document sections (Executive Summary, Recommendations, etc.)
- Use headingLevel 2 for subsections within a major section
- Use headingLevel 3-4 for detailed breakdowns and sub-subsections
- Use `content` for prose paragraphs — separate paragraphs with \n\n
- Use `bullets` for lists — one string per bullet item
- Use `pageBreakBefore: true` to start a major section on a new page
- Tables autofit to page width by default
- The classification label appears in every page footer
- The document title appears in every page header

## Output Naming Convention

Write documents to `/workspace/group/docs/` using this pattern:

```
{clientCode}-{title-slug}-{date}.docx
```

Examples:
- `CTG-2026-041-coverage-analysis-2026-04-01.docx`
- `CTG-2026-041-compliance-summary-2026-04-01.docx`

Create the `docs/` directory if it doesn't exist.
