/**
 * Tiered Trust Model
 *
 * Three tiers:
 *   verified — PIN confirmed via /verify, full capability
 *   known    — recognized sender ID, draft-only mode
 *   unknown  — unrecognized, rejected with polite refusal + alert to main chat
 *
 * Verified sessions persist in SQLite with a configurable TTL.
 * The PIN is stored age-encrypted at ~/ai-shared/secrets/JARVIS_PIN.age
 * and decrypted at runtime via the age identity key.
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { logger } from './logger.js';
import { initDatabase } from './db.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TrustTier = 'verified' | 'known' | 'unknown';

export interface TrustResult {
  tier: TrustTier;
  senderId: string;
  senderName: string;
  chatJid: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const HOME = process.env.HOME || os.homedir();
const SECRETS_DIR = path.join(HOME, 'ai-shared', 'secrets');
const PIN_FILE = path.join(SECRETS_DIR, 'JARVIS_PIN.age');
const IDENTITY_FILE = path.join(SECRETS_DIR, 'age-identity.txt');

/** How long a /verify session lasts before requiring re-verification (ms) */
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Known sender IDs — these get "known" tier (draft-only) without PIN.
 * Add Telegram user IDs of people who should have limited access.
 * The main channel owner is always verified by default.
 */
const KNOWN_SENDERS_PATH = path.join(
  HOME,
  '.config',
  'nanoclaw',
  'known-senders.json',
);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

// In-memory verified sessions: senderId -> expiry timestamp
const verifiedSessions = new Map<string, number>();

// Main channel JID — set during init, used for alert routing
let mainChatJid: string | null = null;
// Main channel owner sender ID — always verified
let mainOwnerId: string | null = null;

// ---------------------------------------------------------------------------
// PIN management
// ---------------------------------------------------------------------------

function decryptPin(): string | null {
  if (!fs.existsSync(PIN_FILE)) {
    logger.warn({ path: PIN_FILE }, 'Trust: PIN file not found');
    return null;
  }
  if (!fs.existsSync(IDENTITY_FILE)) {
    logger.warn({ path: IDENTITY_FILE }, 'Trust: age identity key not found');
    return null;
  }
  try {
    const result = execFileSync('age', ['-d', '-i', IDENTITY_FILE, PIN_FILE], {
      encoding: 'utf-8',
      timeout: 5000,
    });
    return result.trim();
  } catch (err) {
    logger.error({ err }, 'Trust: failed to decrypt PIN');
    return null;
  }
}

// ---------------------------------------------------------------------------
// Known senders
// ---------------------------------------------------------------------------

interface KnownSendersConfig {
  verifiedSenders?: string[]; // Always-verified across all chats (no PIN needed)
  senders: string[]; // Known tier (draft-only)
}

function loadSendersConfig(): KnownSendersConfig {
  try {
    const raw = fs.readFileSync(KNOWN_SENDERS_PATH, 'utf-8');
    return JSON.parse(raw) as KnownSendersConfig;
  } catch {
    return { senders: [] };
  }
}

function loadVerifiedSenders(): Set<string> {
  const cfg = loadSendersConfig();
  return new Set((cfg.verifiedSenders || []).map(String));
}

function loadKnownSenders(): Set<string> {
  const cfg = loadSendersConfig();
  return new Set((cfg.senders || []).map(String));
}

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

/**
 * Initialize the trust system. Call once at startup.
 * @param mainJid The main channel JID (owner is always verified)
 * @param ownerId The Telegram user ID of the main channel owner
 */
export function initTrust(mainJid: string, ownerId?: string): void {
  mainChatJid = mainJid;
  mainOwnerId = ownerId || null;
  logger.info(
    { mainJid, hasPin: fs.existsSync(PIN_FILE), ownerId: ownerId || 'unset' },
    'Trust model initialized',
  );
}

/**
 * Classify a sender into a trust tier.
 */
export function classifySender(
  senderId: string,
  senderName: string,
  chatJid: string,
): TrustResult {
  const result: TrustResult = {
    tier: 'unknown',
    senderId,
    senderName,
    chatJid,
  };

  // Main channel owner is always verified
  if (mainOwnerId && senderId === mainOwnerId) {
    result.tier = 'verified';
    return result;
  }

  // Config-based always-verified senders (no PIN needed)
  const alwaysVerified = loadVerifiedSenders();
  if (alwaysVerified.has(senderId)) {
    result.tier = 'verified';
    return result;
  }

  // Check verified session (PIN previously confirmed)
  const expiry = verifiedSessions.get(senderId);
  if (expiry && Date.now() < expiry) {
    result.tier = 'verified';
    return result;
  }
  // Clean expired session
  if (expiry) verifiedSessions.delete(senderId);

  // Check known senders list
  const known = loadKnownSenders();
  if (known.has(senderId)) {
    result.tier = 'known';
    return result;
  }

  return result;
}

/**
 * Attempt PIN verification. Returns true if PIN matches.
 */
export function verifyPin(senderId: string, attemptedPin: string): boolean {
  const correctPin = decryptPin();
  if (!correctPin) {
    logger.warn('Trust: cannot verify PIN — decryption failed or PIN not set');
    return false;
  }

  // Constant-time comparison to prevent timing attacks
  if (attemptedPin.length !== correctPin.length) return false;
  let mismatch = 0;
  for (let i = 0; i < correctPin.length; i++) {
    mismatch |= correctPin.charCodeAt(i) ^ attemptedPin.charCodeAt(i);
  }
  const match = mismatch === 0;

  if (match) {
    verifiedSessions.set(senderId, Date.now() + VERIFY_TTL_MS);
    logger.info({ senderId }, 'Trust: PIN verified, session created (24h)');
  } else {
    logger.warn({ senderId }, 'Trust: PIN verification failed');
  }

  return match;
}

/**
 * Revoke a verified session.
 */
export function revokeSession(senderId: string): void {
  verifiedSessions.delete(senderId);
  logger.info({ senderId }, 'Trust: session revoked');
}

/**
 * Check if trust system is fully configured (PIN exists + identity key exists).
 */
export function isTrustConfigured(): boolean {
  return fs.existsSync(PIN_FILE) && fs.existsSync(IDENTITY_FILE);
}

/**
 * Get the main chat JID for sending alerts.
 */
export function getMainChatJid(): string | null {
  return mainChatJid;
}

// ---------------------------------------------------------------------------
// Message wrappers for tier-based responses
// ---------------------------------------------------------------------------

export function getDraftModeNotice(senderName: string): string {
  return (
    `_${senderName}, you're in draft-only mode. ` +
    `I can research and draft responses, but I can't execute commands, ` +
    `send messages on your behalf, or access the vault. ` +
    `Use /verify <PIN> for full access._`
  );
}

export function getUnknownSenderRefusal(senderName: string): string {
  return (
    `I appreciate the interest, ${senderName}, but I'm not authorised ` +
    `to assist unrecognised users. Please contact the administrator ` +
    `if you believe this is an error.`
  );
}

export function getUnknownSenderAlert(
  senderId: string,
  senderName: string,
  chatJid: string,
  messagePreview: string,
): string {
  const preview =
    messagePreview.length > 100
      ? messagePreview.slice(0, 100) + '...'
      : messagePreview;
  return (
    `*Trust Alert*\n` +
    `Unknown sender attempted contact:\n` +
    `• Sender: ${senderName} (ID: \`${senderId}\`)\n` +
    `• Chat: \`${chatJid}\`\n` +
    `• Message: _${preview}_\n\n` +
    `Use /trust-add ${senderId} to add as known sender.`
  );
}
