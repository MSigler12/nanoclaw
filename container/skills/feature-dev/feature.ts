#!/usr/bin/env npx tsx
// ---------------------------------------------------------------------------
// Feature Dev CLI — state machine for structured development lifecycle
//
// Commands:
//   init     --name "..." --description "..."
//   advance  --id x --approved-by y [--artifact "..."] [--note "..."]
//   artifact --id x --type t --value "..."
//   status   --id x
//   list     [--status s] [--phase p]
//   abort    --id x --approved-by y [--note "..."]
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';

import {
  type Feature,
  type FeatureTracker,
  type Phase,
  PHASES,
  nextPhase,
  slugify,
} from './types.js';

// ---------------------------------------------------------------------------
// State file management
// ---------------------------------------------------------------------------

const TRACKER_DIR = '/workspace/group/features';
const TRACKER_PATH = path.join(TRACKER_DIR, 'feature-tracker.json');

function readTracker(): FeatureTracker {
  try {
    if (fs.existsSync(TRACKER_PATH)) {
      return JSON.parse(fs.readFileSync(TRACKER_PATH, 'utf-8'));
    }
  } catch {
    // Corrupt file — start fresh
  }
  return { features: [] };
}

function writeTracker(tracker: FeatureTracker): void {
  fs.mkdirSync(TRACKER_DIR, { recursive: true });
  const tmp = `${TRACKER_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(tracker, null, 2), 'utf-8');
  fs.renameSync(tmp, TRACKER_PATH);
}

function findFeature(
  tracker: FeatureTracker,
  id: string,
): Feature | undefined {
  return tracker.features.find((f) => f.id === id);
}

function now(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Argument parsing (minimal, no external deps)
// ---------------------------------------------------------------------------

function parseArgs(
  argv: string[],
): { command: string; flags: Record<string, string> } {
  const command = argv[0] || '';
  const flags: Record<string, string> = {};

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--') && i + 1 < argv.length) {
      const key = arg.slice(2);
      flags[key] = argv[++i];
    }
  }

  return { command, flags };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function cmdInit(flags: Record<string, string>): void {
  const name = flags.name;
  const description = flags.description || '';

  if (!name) {
    console.error('Usage: feature.ts init --name "Feature Name" --description "..."');
    process.exit(1);
  }

  const id = slugify(name);
  const tracker = readTracker();

  if (findFeature(tracker, id)) {
    console.error(`Feature "${id}" already exists. Use a different name or check: feature.ts status --id ${id}`);
    process.exit(1);
  }

  const feature: Feature = {
    id,
    name,
    description,
    phase: 'brainstorm',
    status: 'active',
    createdAt: now(),
    updatedAt: now(),
    gates: [
      {
        from: 'init',
        to: 'brainstorm',
        approvedBy: 'auto',
        timestamp: now(),
      },
    ],
    artifacts: [],
  };

  tracker.features.push(feature);
  writeTracker(tracker);

  console.log(`FEATURE CREATED`);
  console.log(`===============`);
  console.log(`  ID:          ${id}`);
  console.log(`  Name:        ${name}`);
  console.log(`  Description: ${description}`);
  console.log(`  Phase:       BRAINSTORM`);
  console.log(`  Status:      active`);
  console.log(`\nBegin the BRAINSTORM phase. Invoke superpowers:brainstorming.`);
}

function cmdAdvance(flags: Record<string, string>): void {
  const id = flags.id;
  const approvedBy = flags['approved-by'];
  const artifactValue = flags.artifact;
  const note = flags.note;

  if (!id || !approvedBy) {
    console.error(
      'Usage: feature.ts advance --id <id> --approved-by <name> [--artifact "..."] [--note "..."]',
    );
    process.exit(1);
  }

  const tracker = readTracker();
  const feature = findFeature(tracker, id);

  if (!feature) {
    console.error(`Feature "${id}" not found.`);
    process.exit(1);
  }

  if (feature.status !== 'active') {
    console.error(
      `Feature "${id}" is ${feature.status} — cannot advance.`,
    );
    process.exit(1);
  }

  const next = nextPhase(feature.phase);
  if (!next) {
    // At SHIP — mark completed
    feature.status = 'completed';
    feature.updatedAt = now();
    feature.gates.push({
      from: feature.phase,
      to: feature.phase, // stays at ship
      approvedBy,
      timestamp: now(),
      note: note || 'Feature shipped',
    });
    if (artifactValue) {
      feature.artifacts.push({
        phase: feature.phase,
        type: 'ship-ref',
        value: artifactValue,
        timestamp: now(),
      });
    }
    writeTracker(tracker);
    console.log(`FEATURE COMPLETED: ${feature.name}`);
    console.log(`  All phases passed. Status: completed.`);
    return;
  }

  // Record artifact if provided
  if (artifactValue) {
    const artifactType = getDefaultArtifactType(feature.phase);
    feature.artifacts.push({
      phase: feature.phase,
      type: artifactType,
      value: artifactValue,
      timestamp: now(),
    });
  }

  // Record gate transition
  feature.gates.push({
    from: feature.phase,
    to: next,
    approvedBy,
    timestamp: now(),
    note,
  });

  feature.phase = next;
  feature.updatedAt = now();
  writeTracker(tracker);

  const phaseGuide = getPhaseGuide(next);
  console.log(`GATE PASSED: ${feature.name}`);
  console.log(`  ${feature.gates[feature.gates.length - 2]?.to?.toUpperCase() || 'INIT'} → ${next.toUpperCase()}`);
  console.log(`  Approved by: ${approvedBy}`);
  console.log(`\n${phaseGuide}`);
}

function cmdArtifact(flags: Record<string, string>): void {
  const id = flags.id;
  const type = flags.type;
  const value = flags.value;

  if (!id || !type || !value) {
    console.error(
      'Usage: feature.ts artifact --id <id> --type <type> --value "..."',
    );
    process.exit(1);
  }

  const tracker = readTracker();
  const feature = findFeature(tracker, id);

  if (!feature) {
    console.error(`Feature "${id}" not found.`);
    process.exit(1);
  }

  feature.artifacts.push({
    phase: feature.phase,
    type,
    value,
    timestamp: now(),
  });
  feature.updatedAt = now();
  writeTracker(tracker);

  console.log(`ARTIFACT RECORDED: ${feature.name}`);
  console.log(`  Phase: ${feature.phase.toUpperCase()}`);
  console.log(`  Type:  ${type}`);
  console.log(`  Value: ${value}`);
}

function cmdStatus(flags: Record<string, string>): void {
  const id = flags.id;

  if (!id) {
    console.error('Usage: feature.ts status --id <id>');
    process.exit(1);
  }

  const tracker = readTracker();
  const feature = findFeature(tracker, id);

  if (!feature) {
    console.error(`Feature "${id}" not found.`);
    process.exit(1);
  }

  console.log(`FEATURE: ${feature.name}`);
  console.log(`ID:      ${feature.id}`);
  console.log(`Phase:   ${feature.phase.toUpperCase()}`);
  console.log(`Status:  ${feature.status}`);
  console.log(`Created: ${feature.createdAt}`);
  console.log(`Updated: ${feature.updatedAt}`);

  if (feature.gates.length > 0) {
    console.log(`\nGATES:`);
    for (const g of feature.gates) {
      const fromLabel = g.from === 'init' ? 'init' : g.from.toUpperCase();
      const toLabel = g.to === 'aborted' ? 'ABORTED' : g.to.toUpperCase();
      const noteStr = g.note ? `  "${g.note}"` : '';
      console.log(
        `  ${fromLabel.padEnd(12)} → ${toLabel.padEnd(12)} ${g.approvedBy.padEnd(12)} ${g.timestamp}${noteStr}`,
      );
    }
  }

  if (feature.artifacts.length > 0) {
    console.log(`\nARTIFACTS:`);
    for (const a of feature.artifacts) {
      console.log(
        `  [${a.type}]${' '.repeat(Math.max(1, 16 - a.type.length))}${a.value.padEnd(44)} ${a.timestamp}`,
      );
    }
  }
}

function cmdList(flags: Record<string, string>): void {
  const tracker = readTracker();
  let features = tracker.features;

  if (flags.status) {
    features = features.filter((f) => f.status === flags.status);
  }
  if (flags.phase) {
    features = features.filter((f) => f.phase === flags.phase);
  }

  if (features.length === 0) {
    console.log('No features found.');
    return;
  }

  console.log('FEATURE PORTFOLIO');
  console.log('=================\n');

  for (const f of features) {
    const date = f.updatedAt.split('T')[0];
    console.log(
      `  ${f.id.padEnd(24)} ${f.phase.toUpperCase().padEnd(12)} ${f.status.padEnd(10)} ${date}`,
    );
  }

  const active = tracker.features.filter((f) => f.status === 'active').length;
  const completed = tracker.features.filter(
    (f) => f.status === 'completed',
  ).length;
  const aborted = tracker.features.filter(
    (f) => f.status === 'aborted',
  ).length;

  console.log(
    `\nActive: ${active} | Completed: ${completed} | Aborted: ${aborted}`,
  );
}

function cmdAbort(flags: Record<string, string>): void {
  const id = flags.id;
  const approvedBy = flags['approved-by'];
  const note = flags.note;

  if (!id || !approvedBy) {
    console.error(
      'Usage: feature.ts abort --id <id> --approved-by <name> [--note "..."]',
    );
    process.exit(1);
  }

  const tracker = readTracker();
  const feature = findFeature(tracker, id);

  if (!feature) {
    console.error(`Feature "${id}" not found.`);
    process.exit(1);
  }

  if (feature.status !== 'active') {
    console.error(
      `Feature "${id}" is already ${feature.status}.`,
    );
    process.exit(1);
  }

  feature.gates.push({
    from: feature.phase,
    to: 'aborted',
    approvedBy,
    timestamp: now(),
    note,
  });
  feature.status = 'aborted';
  feature.updatedAt = now();
  writeTracker(tracker);

  console.log(`FEATURE ABORTED: ${feature.name}`);
  console.log(`  From phase: ${feature.phase.toUpperCase()}`);
  console.log(`  By: ${approvedBy}`);
  if (note) console.log(`  Note: ${note}`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDefaultArtifactType(phase: Phase): string {
  const map: Record<Phase, string> = {
    brainstorm: 'design-summary',
    spec: 'spec',
    plan: 'plan',
    implement: 'commit',
    test: 'test-results',
    review: 'review',
    ship: 'ship-ref',
  };
  return map[phase];
}

function getPhaseGuide(phase: Phase): string {
  const guides: Record<Phase, string> = {
    brainstorm:
      'Begin BRAINSTORM phase. Invoke superpowers:brainstorming to explore requirements and propose approaches.',
    spec: 'Begin SPEC phase. Write the approved design to a spec file. Self-review for placeholders and contradictions. Get user approval of the written spec.',
    plan: 'Begin PLAN phase. Invoke superpowers:writing-plans to break the spec into implementation steps.',
    implement:
      'Begin IMPLEMENT phase. Execute the plan. Use superpowers:test-driven-development where applicable. Record commits with: feature.ts artifact --id <id> --type commit --value "<hash>"',
    test: 'Begin TEST phase. Run the full test suite. Invoke superpowers:verification-before-completion. Record results with: feature.ts artifact --id <id> --type test-results --value "<summary>"',
    review:
      'Begin REVIEW phase. Invoke superpowers:requesting-code-review. Review against the spec and plan.',
    ship: 'Begin SHIP phase. Final verification. Push, create PR, tag, or deploy. Record the ship reference when done.',
  };
  return guides[phase];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const { command, flags } = parseArgs(process.argv.slice(2));

switch (command) {
  case 'init':
    cmdInit(flags);
    break;
  case 'advance':
    cmdAdvance(flags);
    break;
  case 'artifact':
    cmdArtifact(flags);
    break;
  case 'status':
    cmdStatus(flags);
    break;
  case 'list':
    cmdList(flags);
    break;
  case 'abort':
    cmdAbort(flags);
    break;
  default:
    console.error(
      'Usage: feature.ts <init|advance|artifact|status|list|abort> [options]\n\n' +
        'Commands:\n' +
        '  init     --name "..." --description "..."           Create a feature\n' +
        '  advance  --id x --approved-by y [--artifact "..."]  Advance to next phase\n' +
        '  artifact --id x --type t --value "..."              Record an artifact\n' +
        '  status   --id x                                     Show feature state\n' +
        '  list     [--status s] [--phase p]                   Portfolio view\n' +
        '  abort    --id x --approved-by y [--note "..."]      Cancel a feature',
    );
    process.exit(1);
}
