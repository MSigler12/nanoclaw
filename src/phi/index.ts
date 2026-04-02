/**
 * PHI Scrubber — Infrastructure-level PHI enforcement for NanoClaw.
 *
 * Detects Protected Health Information in content headed to non-Anthropic
 * models and signals the caller to reroute to phi_fallback (Claude Haiku).
 * Fail-closed on all error paths.
 *
 * Public API:
 *   scanForPHI(content, targetRole) → ScanResult
 *   logPHIEvent(event)              → void
 *   initAuditLog(customPath?)       → void
 */

import type { RoleName } from '../registry/modelRegistry.js';
import type { ScanResult } from './types.js';
import { runPatterns } from './patterns.js';
import { getRoleSensitivity } from './roles.js';
import { classifyWithHaiku } from './classifier.js';
import { logger } from '../logger.js';

// ---------------------------------------------------------------------------
// Re-exports (public API surface)
// ---------------------------------------------------------------------------

export { logPHIEvent, initAuditLog } from './audit.js';
export type { ScanResult, PHIEvent, DetectionLayer } from './types.js';

// ---------------------------------------------------------------------------
// Result constructors
// ---------------------------------------------------------------------------

function clean(): ScanResult {
  return {
    clean: true,
    reroute: false,
    patternTypes: [],
    detectionLayer: 'regex',
  };
}

function reroute(
  patternTypes: string[],
  detectionLayer: ScanResult['detectionLayer'],
): ScanResult {
  return { clean: false, reroute: true, patternTypes, detectionLayer };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Scan content for PHI and determine whether it must be rerouted.
 *
 * Flow:
 *   1. Run HIPAA Safe Harbor regex patterns
 *   2. If regex matches → reroute
 *   3. If regex clean + low-sensitivity role → clean
 *   4. If regex clean + high-sensitivity role → Haiku classifier
 *   5. Any error at any stage → reroute (fail closed)
 *
 * The caller is responsible for skipping the scan entirely for
 * Anthropic-locked roles (default, reasoning, phi_fallback).
 */
export async function scanForPHI(
  content: string,
  targetRole: RoleName,
): Promise<ScanResult> {
  try {
    // --- Layer 1: Regex ---
    const regexMatches = runPatterns(content);

    if (regexMatches.length > 0) {
      return reroute(regexMatches, 'regex');
    }

    // --- Sensitivity gate ---
    const sensitivity = getRoleSensitivity(targetRole);

    if (sensitivity === 'low') {
      return clean();
    }

    // --- Layer 2: Haiku classifier (high-sensitivity roles only) ---
    const classifierResult = await classifyWithHaiku(content);

    if (classifierResult.containsPHI) {
      return reroute(classifierResult.patternTypes, 'classifier');
    }

    return clean();
  } catch (err) {
    // Fail closed — any unexpected error results in reroute
    logger.error({ err }, 'PHI scrubber unexpected error — failing closed');
    return reroute(['SCAN_ERROR'], 'error');
  }
}
