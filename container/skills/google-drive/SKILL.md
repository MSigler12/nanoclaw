---
name: google-drive
description: Search and read Google Drive documents as a knowledge source for answering questions
allowed-tools: Bash(*)
---

# Google Drive Retrieval

Search and read documents from The Cottano Group's Google Drive to ground your responses in internal organizational knowledge. Use the `search_drive` and `read_drive_file` MCP tools.

## When to Search Drive

Search Drive proactively when answering questions about:

- Internal policies, SOPs, or procedures
- Client-specific documents, contracts, or agreements
- Rate schedules, fee structures, or reimbursement tables
- Compliance documentation or audit records
- Organizational structure, roles, or responsibilities
- Any topic where your response would be stronger with internal document context

## When NOT to Search Drive

Do not search Drive for:

- General knowledge you can answer directly
- Public regulatory information (use CMS MCP tools, WebSearch instead)
- Coding or technical questions unrelated to Cottano Group operations
- When the user explicitly says not to check internal files

## How to Use

### Step 1: Search for relevant documents

```
search_drive({
  query: "RHC compliance SOP",
  fileType: "document",        // optional: document, spreadsheet, pdf, presentation
  maxResults: 5                // optional: default 10, max 25
})
```

Search tips:
- Start with specific terms: document title, client name, policy number
- If no results, broaden to topic keywords
- Use `fileType` when you know the format (spreadsheets for rate tables, documents for SOPs)
- Use `folderId` if the user references a specific Drive folder
- Results are sorted by most recently modified

### Step 2: Read the relevant document

```
read_drive_file({
  fileId: "1abc...",           // from search results
  format: "text",             // or "markdown" for Google Docs
  maxLength: 50000            // default, increase for large docs
})
```

### Step 3: Use the content in your response

Incorporate the document content into your answer. Always attribute:

> Per {document name} (last modified {date}), ...

## Handling Large Documents

- Check `totalLength` in the response before reading. If over 30,000 chars, consider:
  - Request a partial read with a targeted `maxLength` and `offset`
  - Read the beginning to understand structure, then target the relevant section
- For spreadsheets (CSV export): may be large — use `maxLength` and scan for relevant rows
- Summarize retrieved content for the user. Do not paste entire documents into chat.

## PHI Handling

Documents may contain Protected Health Information. When using Drive content:

- Summarize findings without reproducing identifiable patient information
- Do not quote patient names, SSNs, MRNs, DOBs, or other HIPAA identifiers from documents
- If a document contains PHI relevant to the answer, describe the finding generically:
  "The compliance audit from March 2026 identified 3 documentation deficiencies" — not the patient details.

## Drive Folder Structure

Update this section to reflect your Google Drive folder layout. This helps the agent search more efficiently.

- /Cottano Group/SOPs/ — standard operating procedures
- /Cottano Group/Policies/ — compliance and HR policies
- /Cottano Group/Clients/ — per-client folders with contracts, correspondence
- /Cottano Group/Rate Schedules/ — reimbursement and fee tables
- /Cottano Group/Templates/ — document templates
- /Cottano Group/Audits/ — compliance audit records and findings

## Error Handling

- If Drive is not configured: tell the user to run the setup script on the host
- If a search returns no results: broaden the query or try alternate terms
- If a file can't be read: report the file name and error, suggest the user check permissions
- If Drive times out: proceed without Drive context, note it in your response
