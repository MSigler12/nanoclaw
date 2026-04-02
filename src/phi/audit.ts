import fs from 'fs';
import path from 'path';
import os from 'os';

import { logger } from '../logger.js';
import type { PHIEvent } from './types.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const DEFAULT_PATH = path.join(
  os.homedir(),
  'ai-shared',
  'logs',
  'phi-audit.log',
);

let auditLogPath: string = DEFAULT_PATH;

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Set the audit log file path and ensure the parent directory exists.
 *
 * Resolution order:
 *   1. Explicit `customPath` argument
 *   2. `PHI_AUDIT_LOG` environment variable
 *   3. Default: ~/ai-shared/logs/phi-audit.log
 *
 * Call once at startup. Safe to call multiple times (last call wins).
 */
export function initAuditLog(customPath?: string): void {
  auditLogPath =
    customPath || process.env.PHI_AUDIT_LOG || DEFAULT_PATH;

  try {
    fs.mkdirSync(path.dirname(auditLogPath), { recursive: true });
  } catch (err) {
    logger.error(
      { err, path: auditLogPath },
      'Failed to create PHI audit log directory',
    );
  }
}

// ---------------------------------------------------------------------------
// Writer
// ---------------------------------------------------------------------------

/**
 * Append a PHI reroute event to the audit log.
 *
 * - One JSON object per line (JSONL format)
 * - Never throws — write failures are logged via logger.error()
 * - Never logs actual PHI — only pattern type labels and metadata
 */
export function logPHIEvent(event: PHIEvent): void {
  try {
    const line = JSON.stringify(event) + '\n';
    fs.appendFileSync(auditLogPath, line, 'utf-8');
  } catch (err) {
    // Audit failure must never block the reroute decision
    logger.error(
      { err, event: { ...event } },
      'Failed to write PHI audit log',
    );
  }
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Returns the current audit log path. Exported for testing only. */
export function _getAuditLogPath(): string {
  return auditLogPath;
}

/** Reset path to default. Exported for testing only. */
export function _resetAuditLogPath(): void {
  auditLogPath = DEFAULT_PATH;
}
