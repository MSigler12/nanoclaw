import type { RoleName } from '../registry/modelRegistry.js';
import type { RoleSensitivity } from './types.js';

// ---------------------------------------------------------------------------
// Role sensitivity tiers
//
// HIGH = regex + Haiku classifier (two-layer scan)
// LOW  = regex only (single-layer scan)
//
// Anthropic-locked roles (default, reasoning, phi_fallback) never reach the
// scrubber — the caller skips the scan entirely for those. They are mapped
// here as LOW purely for type completeness; the value is never read.
// ---------------------------------------------------------------------------

const ROLE_SENSITIVITY: Record<RoleName, RoleSensitivity> = {
  // High-sensitivity: non-Anthropic roles that handle rich content
  research: 'high',
  longContext: 'high',
  code: 'high',
  crossValidation: 'high',

  // Low-sensitivity: lightweight/utility roles, regex sufficient
  subAgent: 'low',
  classifier: 'low',
  image: 'low',

  // Anthropic-locked: caller skips scan, mapped for completeness
  default: 'low',
  reasoning: 'low',
  phi_fallback: 'low',
};

/**
 * Returns the sensitivity tier for a given role.
 * High-sensitivity roles get two-layer scanning (regex + Haiku classifier).
 * Low-sensitivity roles get regex-only scanning.
 */
export function getRoleSensitivity(role: RoleName): RoleSensitivity {
  return ROLE_SENSITIVITY[role];
}
