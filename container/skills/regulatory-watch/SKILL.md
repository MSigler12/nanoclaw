---
name: regulatory-watch
description: Daily regulatory monitoring for CMS, Federal Register, accreditation bodies, and state survey agencies
allowed-tools: Bash(*)
---

# Regulatory Watch

Daily monitoring of regulatory changes relevant to The Cottano Group's Rural Health Clinic clients. Runs at 6am CT as a scheduled task.

## Scheduling

Register this task on first invocation:

```
schedule_task({
  prompt: "Run the Regulatory Watch daily scan. Read /home/node/.claude/skills/regulatory-watch/SKILL.md and follow the workflow exactly.",
  schedule_type: "cron",
  schedule_value: "0 6 * * *",
  context_mode: "isolated"
})
```

## Workflow

Execute these steps in order. Do not skip steps.

### Step 1: Read State File

Read `/workspace/group/regulatory-watch-state.json`.

- If the file exists: use the `lastSeen` markers for each source and the `monitoredStates` array.
- If the file is missing or corrupt: treat this as a first run. Use a 7-day lookback from today. Default monitored states: LA, TX, MS, AL, AR, TN, FL, GA, OK, MO.

Hold the state in memory. Do NOT write the state file until Step 5.

### Step 2: Read Source Configs

Read the config files from the skill directory:

- `/home/node/.claude/skills/regulatory-watch/sources.json` — data source definitions
- `/home/node/.claude/skills/regulatory-watch/state-agencies.json` — state survey agency URLs

### Step 3: Query Sources

Check sources in priority order. For each source, only report items newer than that source's `lastSeen` date.

**Priority order:**

1. FEDERAL REGISTER
2. CMS COVERAGE (NCDs, LCDs, NCAs, MLN Matters)
3. ACCREDITATION (TJC, CARF, AAAHC)
4. STATE UPDATES (per monitoredStates)

If you run into context or time limits, cut from the bottom. Federal Register and CMS sources must always be checked.

#### Query methods by source type:

**type: "mcp"**
Call the CMS Coverage MCP tool specified in the source config. Filter results where the publication or revision date is after the source's `lastSeen` marker. Apply the `relevanceFilter` keywords to focus on RHC-relevant items.

**type: "api"**
Use WebFetch to call the URL with the query parameters from the config. The Federal Register API returns JSON. Parse the `results` array and filter by `publication_date` > lastSeen.

**type: "web"**
Use WebFetch on the URL (and any `secondaryUrls`). Read the page content and identify dated entries (press releases, news items, bulletins, standards updates) that are newer than lastSeen. Use the `relevanceFilter` to focus on relevant items. If the page structure makes it hard to identify dates, fall back to WebSearch: `site:{domain} after:{lastSeen date}`.

**State survey agencies:**
For each state in `monitoredStates`:
1. Look up the state code in `state-agencies.json`.
2. If the state is NOT in the lookup: note a warning for the digest ("No URL configured for state {XX}") and skip.
3. If the state IS in the lookup: WebFetch the URL, scan for updates newer than `lastSeen` for that state's source key (`state_{CODE}`).
4. Only report findings. If a state has no updates, silently skip it.

#### Source failure handling:

If a source fetch fails (network error, timeout, MCP error):
- Log a warning for the digest: "Could not reach {source name} — will retry tomorrow."
- Continue with remaining sources.
- Do NOT advance that source's `lastSeen` marker in Step 5.

### Step 4: Format and Send Digest

Compose the digest message and send via `send_message`.

**Format when findings exist:**

```
Regulatory Watch — {Month Day, Year}

{CATEGORY NAME}
- {Title/identifier} — {brief summary} ({date})
- {Title/identifier} — {brief summary} ({date})

{CATEGORY NAME}
- {Finding}

STATE UPDATES
- {ST}: {Agency action summary} ({date})
```

**Rules:**
- Category headers are uppercase plain text (FEDERAL REGISTER, CMS COVERAGE, ACCREDITATION, STATE UPDATES)
- Only include categories that have findings — no empty sections
- Sources with no changes are silently skipped. No "nothing new" lines.
- Each finding: leading dash, title or identifier, brief summary, date in parentheses
- State findings prefixed with the two-letter state code

**Format when no findings:**

```
Regulatory Watch — {Month Day, Year}

No regulatory changes detected today.
```

**If all sources failed:**

```
Regulatory Watch — {Month Day, Year}

All source checks failed. Will retry tomorrow.
```

Include any source-specific warnings at the end of the digest (unreachable sources, missing state URLs).

### Step 5: Update State File (atomic)

Only execute this step if the run completed without fatal errors.

Build the updated state object:
- Set `lastSuccessfulRun` to the current ISO timestamp.
- For each source that was successfully checked (no fetch errors), advance its `lastSeen` to today's date.
- For sources that failed, keep their existing `lastSeen` unchanged.
- Preserve the `monitoredStates` array as-is.

Write the complete JSON to `/workspace/group/regulatory-watch-state.json`.

IMPORTANT: Only write the state file after the digest has been sent successfully. If the run failed partway through, do NOT update the state file — leave it unchanged so the next run retries from the same markers.

### Step 6: DOCX Escalation (conditional)

After sending the digest, evaluate whether any finding warrants a formal analysis document.

**Generate a DOCX report when:**
- A new or revised NCD directly affects RHC services
- A Federal Register final rule (not proposed) modifies 42 CFR Part 491
- An accreditation body issues a standards revision with compliance deadlines
- A state survey agency issues an enforcement action or major protocol change

**Do NOT generate a DOCX for:**
- Proposed rules (track in digest, formal report when finalized)
- MLN Matters articles (operational, not policy-level)
- Routine newsletters or informational bulletins
- State agency page updates with no substantive regulatory content

**When generating a DOCX:**
1. Use the doc-generator skill to produce a branded analysis document.
2. The document should contain: executive summary of the change, regulatory context, impact analysis for RHC clients, recommended actions, and applicable deadlines.
3. Use `classificationLabel: "CONFIDENTIAL"` and appropriate `clientCode`.
4. Write to `/workspace/group/docs/`.
5. Add a note to the digest (or send a follow-up message): "Formal analysis generated — see {filename}."

## Source-Specific Guidance

### Federal Register
The API at `https://www.federalregister.gov/api/v1/documents.json` returns structured JSON. Key fields in each result: `title`, `type` (Rule, Proposed Rule, Notice), `publication_date`, `abstract`, `html_url`. A final rule modifying 42 CFR 491 is the highest-impact finding possible — always escalate to DOCX.

### CMS NCDs/LCDs
Use the CMS Coverage MCP tools. For LCDs, check contractors in the monitored states. Focus on determinations that affect services commonly provided by RHCs: office visits, physical therapy, preventive services, lab tests, DME.

### MLN Matters
These are the most operationally relevant CMS publications for RHC clients. They translate policy into billing and operational guidance. Look for articles with "RHC", "Rural Health", "provider enrollment", or "reimbursement" in the title or summary.

### Accreditation Bodies
TJC, CARF, and AAAHC update standards on different cycles. Focus on:
- TJC: R3 Reports (rationale for new requirements), Sentinel Event Alerts, standards updates for ambulatory care
- CARF: Standards manual updates, accreditation policy changes
- AAAHC: ASC-relevant standards revisions, compliance alerts

### State Survey Agencies
State pages vary widely in structure. Use your language understanding to identify:
- New survey protocols or guidance documents
- Enforcement actions or sanctions
- Revised licensure requirements
- Emergency directives or policy changes

If a state page is entirely unhelpful or unchanged, silently skip it. Only report substantive regulatory actions.
