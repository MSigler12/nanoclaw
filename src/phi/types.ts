import type { RoleName } from '../registry/modelRegistry.js';

// ---------------------------------------------------------------------------
// Pattern detection
// ---------------------------------------------------------------------------

export interface PHIPattern {
  /** Identifier key used in audit logs, e.g. 'SSN', 'MRN' */
  id: string;
  /** Human-readable label */
  label: string;
  /** Regex to match against content */
  pattern: RegExp;
  /** Detection reliability tier */
  confidence: 'high' | 'medium' | 'low';
  /**
   * If set, the pattern only triggers when this secondary regex also matches
   * somewhere in the content. Used for medium/low-confidence patterns to
   * reduce false positives (e.g. ZIP codes only flag near patient context).
   */
  contextRequired?: RegExp;
  /**
   * Optional post-match validator. Return false to suppress a match.
   * Used for patterns that need numeric-range checks (e.g. age > 89).
   */
  validate?: (match: string) => boolean;
}

// ---------------------------------------------------------------------------
// Scan results
// ---------------------------------------------------------------------------

export type DetectionLayer = 'regex' | 'classifier' | 'error';

export interface ScanResult {
  /** true when no PHI detected */
  clean: boolean;
  /** true when content must be rerouted to phi_fallback */
  reroute: boolean;
  /** Pattern type labels that triggered detection (never actual PHI) */
  patternTypes: string[];
  /** Which detection layer produced the result */
  detectionLayer: DetectionLayer;
}

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------

export interface ClassifierResult {
  containsPHI: boolean;
  patternTypes: string[];
  confidence: 'high' | 'medium' | 'low';
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export interface PHIEvent {
  timestamp: string;
  originalRole: RoleName;
  originalModel: string;
  reroutedTo: string;
  patternTypes: string[];
  detectionLayer: DetectionLayer;
  taskId?: string;
}

// ---------------------------------------------------------------------------
// Role sensitivity
// ---------------------------------------------------------------------------

export type RoleSensitivity = 'high' | 'low';
