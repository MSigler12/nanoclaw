import { logger } from '../logger.js';
import { readEnvFile } from '../env.js';
import type { ClassifierResult } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const CLASSIFIER_MODEL = 'claude-haiku-4-5-20251001';
const CLASSIFIER_MAX_TOKENS = 256;
const CLASSIFIER_TIMEOUT_MS = 5_000;
const API_VERSION = '2023-06-01';

const SYSTEM_PROMPT = `You are a PHI detection classifier. Analyze the following content and determine whether it contains Protected Health Information (PHI) as defined by the HIPAA Safe Harbor method.

Respond ONLY with a JSON object. No explanation, no preamble.

{
  "containsPHI": true/false,
  "patternTypes": ["PERSON_NAME", "GEOGRAPHIC", ...],
  "confidence": "high" | "medium" | "low"
}

Pattern type vocabulary (use only these labels):
PERSON_NAME, GEOGRAPHIC, DATE_OF_BIRTH, AGE_OVER_89, PHONE_FAX,
EMAIL, SSN, MRN, ACCOUNT_NUMBER, LICENSE_NUMBER, DEVICE_IDENTIFIER,
URL, IP_ADDRESS, BIOMETRIC, PHOTOGRAPH, BENEFICIARY_NUMBER,
CLINICAL_NARRATIVE, OTHER_UNIQUE_IDENTIFIER

Flag CLINICAL_NARRATIVE when patient-identifiable medical details appear
(diagnosis + treatment + identifiers in combination), even if no single
HIPAA identifier is present alone.

Err on the side of detection. If uncertain, flag it.`;

const VALID_PATTERN_TYPES = new Set([
  'PERSON_NAME',
  'GEOGRAPHIC',
  'DATE_OF_BIRTH',
  'AGE_OVER_89',
  'PHONE_FAX',
  'EMAIL',
  'SSN',
  'MRN',
  'ACCOUNT_NUMBER',
  'LICENSE_NUMBER',
  'DEVICE_IDENTIFIER',
  'URL',
  'IP_ADDRESS',
  'BIOMETRIC',
  'PHOTOGRAPH',
  'BENEFICIARY_NUMBER',
  'CLINICAL_NARRATIVE',
  'OTHER_UNIQUE_IDENTIFIER',
]);

// ---------------------------------------------------------------------------
// Fail-closed helpers
// ---------------------------------------------------------------------------

function failClosed(reason: string): ClassifierResult {
  return { containsPHI: true, patternTypes: [reason], confidence: 'high' };
}

// ---------------------------------------------------------------------------
// API key resolution
// ---------------------------------------------------------------------------

let cachedApiKey: string | undefined;

function getApiKey(): string | undefined {
  if (cachedApiKey) return cachedApiKey;
  // Prefer process.env (set by OneCLI or test harness), then .env file
  const key =
    process.env.ANTHROPIC_API_KEY || readEnvFile(['ANTHROPIC_API_KEY']).ANTHROPIC_API_KEY;
  if (key) cachedApiKey = key;
  return key;
}

/** Reset cached key — for testing only. */
export function _resetApiKeyCache(): void {
  cachedApiKey = undefined;
}

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------

/**
 * Send content to Claude Haiku for PHI classification.
 *
 * - Returns a structured ClassifierResult
 * - Fail-closed: any error (timeout, API, parse) returns containsPHI: true
 * - Never throws
 */
export async function classifyWithHaiku(
  content: string,
): Promise<ClassifierResult> {
  // Empty content is trivially clean
  if (!content.trim()) {
    return { containsPHI: false, patternTypes: [], confidence: 'high' };
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    logger.error('No ANTHROPIC_API_KEY available for PHI classifier');
    return failClosed('CLASSIFIER_NO_API_KEY');
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      CLASSIFIER_TIMEOUT_MS,
    );

    let response: Response;
    try {
      response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': API_VERSION,
        },
        body: JSON.stringify({
          model: CLASSIFIER_MODEL,
          max_tokens: CLASSIFIER_MAX_TOKENS,
          temperature: 0,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content }],
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      logger.error(
        { status: response.status },
        'Haiku classifier API error',
      );
      return failClosed('CLASSIFIER_ERROR');
    }

    const body = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };

    const text = body.content?.[0]?.text;
    if (!text) {
      logger.error('Haiku classifier returned empty content');
      return failClosed('CLASSIFIER_PARSE_ERROR');
    }

    return parseClassifierResponse(text);
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      logger.error('Haiku classifier timed out');
      return failClosed('CLASSIFIER_TIMEOUT');
    }
    logger.error({ err }, 'Haiku classifier unexpected error');
    return failClosed('CLASSIFIER_ERROR');
  }
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

/**
 * Parse the classifier's JSON response. Fail-closed on any parse issue.
 * Normalizes unknown pattern types to OTHER_UNIQUE_IDENTIFIER.
 */
export function parseClassifierResponse(text: string): ClassifierResult {
  let parsed: Record<string, unknown>;
  try {
    // Handle cases where Haiku wraps JSON in markdown code fences
    const cleaned = text.replace(/^```json?\s*\n?|\n?```\s*$/g, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    logger.error(
      { text: text.slice(0, 200) },
      'Haiku classifier returned invalid JSON',
    );
    return failClosed('CLASSIFIER_PARSE_ERROR');
  }

  if (typeof parsed.containsPHI !== 'boolean') {
    logger.error('Haiku classifier response missing containsPHI field');
    return failClosed('CLASSIFIER_PARSE_ERROR');
  }

  const rawTypes = Array.isArray(parsed.patternTypes)
    ? (parsed.patternTypes as string[])
    : [];

  // Normalize unknown types
  const patternTypes = rawTypes.map((t) =>
    VALID_PATTERN_TYPES.has(t) ? t : 'OTHER_UNIQUE_IDENTIFIER',
  );

  const confidence =
    parsed.confidence === 'high' ||
    parsed.confidence === 'medium' ||
    parsed.confidence === 'low'
      ? parsed.confidence
      : 'high'; // default to high if missing/invalid

  return {
    containsPHI: parsed.containsPHI,
    patternTypes,
    confidence,
  };
}
