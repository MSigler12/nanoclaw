---
name: feature-dev
description: Structured feature development lifecycle — Brainstorm → Spec → Plan → Implement → Test → Review → Ship
allowed-tools: Bash(npx tsx *)
---

# Feature Dev

Structured development workflow with gated phases, artifact tracking, and portfolio visibility. Use this for any non-trivial development task — if it involves more than a single-file change, or if anyone will need to understand what was built and why, use this workflow.

## Quick Reference

```bash
# All commands via:
npx tsx /home/node/.claude/skills/feature-dev/feature.ts <command> [args]

# Create a feature
feature.ts init --name "PHI Scrubber" --description "HIPAA Safe Harbor pattern detection"

# Advance to next phase (requires approval)
feature.ts advance --id phi-scrubber --approved-by matthew --artifact "~/ai-shared/phi-scrubber-spec.md"

# Record artifact without advancing
feature.ts artifact --id phi-scrubber --type commit --value "76f4f53"

# Check one feature
feature.ts status --id phi-scrubber

# Portfolio view
feature.ts list
feature.ts list --status active

# Cancel a feature
feature.ts abort --id phi-scrubber --approved-by matthew --note "Descoped"
```

## When to Use

Use this workflow for:
- New features, skills, or capabilities
- Multi-file changes that need design before implementation
- Client deliverables that follow a development lifecycle
- Any work where traceability (who approved what, when) matters

Do NOT use for:
- One-line bug fixes
- Configuration changes
- Conversational tasks (questions, lookups, summaries)

## Workflow

### Before Starting

Always check the portfolio first:

```bash
feature.ts list --status active
```

Show the user what's in progress. This prevents work from being forgotten across sessions.

### Phase 1: BRAINSTORM

**Invoke:** `superpowers:brainstorming`

Explore requirements, ask clarifying questions one at a time, propose 2-3 approaches with trade-offs. Get user approval on the design direction.

**Gate:** User approves the design.

**Advance:**
```bash
feature.ts advance --id <id> --approved-by <name> --artifact "Design approved in conversation"
```

### Phase 2: SPEC

**Action:** Write the approved design to a spec file. Self-review for placeholders, contradictions, and ambiguity. Ask the user to review the written spec.

**Gate:** User approves the spec file.

**Advance:**
```bash
feature.ts advance --id <id> --approved-by <name> --artifact "~/ai-shared/<name>-spec.md"
```

### Phase 3: PLAN

**Invoke:** `superpowers:writing-plans`

Break the spec into implementation steps. Identify dependencies, file changes, and testing strategy.

**Gate:** User approves the plan.

**Advance:**
```bash
feature.ts advance --id <id> --approved-by <name> --artifact "Plan approved in conversation"
```

### Phase 4: IMPLEMENT

**Invoke:** `superpowers:test-driven-development` where applicable.

Execute the plan step by step. Commit working code. Record each commit:

```bash
feature.ts artifact --id <id> --type commit --value "<hash>"
```

This phase may span multiple sessions. The state file tracks all artifacts.

**Gate:** All implementation steps complete. Tests pass.

**Advance:**
```bash
feature.ts advance --id <id> --approved-by <name> --artifact "<final commit hash>"
```

### Phase 5: TEST

**Invoke:** `superpowers:verification-before-completion`

Run the full test suite. Verify no regressions. Confirm the implementation matches the spec.

**Gate:** All tests green. Verification output recorded.

**Advance:**
```bash
feature.ts advance --id <id> --approved-by <name> --artifact "368/368 tests passing"
```

### Phase 6: REVIEW

**Invoke:** `superpowers:requesting-code-review`

Review the implementation against the spec and plan. Check for missed requirements, code quality, and security considerations.

**Gate:** Review passes or all issues resolved.

**Advance:**
```bash
feature.ts advance --id <id> --approved-by <name> --artifact "Review passed — no issues"
```

### Phase 7: SHIP

**Action:** Final verification. Push, create PR, tag release, or deploy — whatever "ship" means for this feature.

**Gate:** User confirms shipped.

**Complete the feature:**
```bash
feature.ts advance --id <id> --approved-by <name> --artifact "https://github.com/.../pull/42"
```

This marks the feature as `completed`.

## Resuming Work

If you pick up a feature in a new session or after context compaction:

1. Check the tracker: `feature.ts status --id <id>`
2. Read the current phase and artifacts
3. Continue from where things left off

The state file is the source of truth — not conversation history.

## Recording Artifacts

Use `artifact` for intermediate work products that don't advance the phase:

```bash
# Multiple commits during IMPLEMENT
feature.ts artifact --id <id> --type commit --value "76f4f53"
feature.ts artifact --id <id> --type commit --value "d391c1c"

# Spec file during SPEC
feature.ts artifact --id <id> --type spec --value "~/ai-shared/my-spec.md"

# Test results during TEST
feature.ts artifact --id <id> --type test-results --value "79/79 passing, 368 suite total"
```

Use `advance` when a phase is complete and approved — it records the final artifact AND moves to the next phase.

## Client Deliverables

When a feature requires a client-facing document (spec summary, test report, release notes), use the doc-generator skill manually. The Feature Dev plugin does not auto-generate documents — you decide when a deliverable is warranted.
