// ---------------------------------------------------------------------------
// Feature Dev Plugin — Types
//
// State machine for structured feature development lifecycle.
// Seven phases, gated transitions, artifact tracking.
// ---------------------------------------------------------------------------

export const PHASES = [
  'brainstorm',
  'spec',
  'plan',
  'implement',
  'test',
  'review',
  'ship',
] as const;

export type Phase = (typeof PHASES)[number];

export interface GateRecord {
  /** Phase transitioned from ('init' for feature creation) */
  from: Phase | 'init';
  /** Phase transitioned to ('aborted' for cancellation) */
  to: Phase | 'aborted';
  /** Who approved the gate: user name, "agent", or "auto" */
  approvedBy: string;
  /** ISO timestamp of the transition */
  timestamp: string;
  /** Optional context for the transition */
  note?: string;
}

export interface Artifact {
  /** Phase that produced this artifact */
  phase: Phase;
  /** Artifact category: "spec", "plan", "commit", "test-results", "review", "ship-ref" */
  type: string;
  /** File path, commit hash, PR URL, or summary text */
  value: string;
  /** ISO timestamp */
  timestamp: string;
}

export interface Feature {
  /** URL-safe slug: "phi-scrubber", "doc-generator" */
  id: string;
  /** Display name: "PHI Scrubber" */
  name: string;
  /** One-line summary */
  description: string;
  /** Current lifecycle phase */
  phase: Phase;
  /** Feature status */
  status: 'active' | 'completed' | 'aborted';
  /** ISO timestamp of creation */
  createdAt: string;
  /** ISO timestamp of last modification */
  updatedAt: string;
  /** Audit trail of phase transitions */
  gates: GateRecord[];
  /** Artifacts produced at each phase */
  artifacts: Artifact[];
}

export interface FeatureTracker {
  features: Feature[];
}

/**
 * Returns the next phase in the lifecycle, or null if at the end.
 */
export function nextPhase(current: Phase): Phase | null {
  const idx = PHASES.indexOf(current);
  if (idx === -1 || idx >= PHASES.length - 1) return null;
  return PHASES[idx + 1];
}

/**
 * Convert a display name to a URL-safe slug.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
