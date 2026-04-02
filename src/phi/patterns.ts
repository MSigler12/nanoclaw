import type { PHIPattern } from './types.js';

// ---------------------------------------------------------------------------
// Healthcare context regex — used by medium/low-confidence patterns to
// reduce false positives. Only fires when content also contains medical terms.
// ---------------------------------------------------------------------------

const HEALTHCARE_CONTEXT =
  /\b(patient|diagnosis|treatment|DOB|admit|discharge|medical|clinical|physician|prescription|medication|hospital|insurance|beneficiary|medicare|medicaid|provider|practitioner|nursing|therapy|surgical|procedure|health\s*care|HIPAA|PHI)\b/i;

// ---------------------------------------------------------------------------
// HIPAA Safe Harbor 18 Identifiers
// ---------------------------------------------------------------------------

export const PHI_PATTERNS: PHIPattern[] = [
  // ── 1. SSN ──────────────────────────────────────────────────────────────
  {
    id: 'SSN',
    label: 'Social Security Number',
    pattern: /\b\d{3}-\d{2}-\d{4}\b/,
    confidence: 'high',
  },
  {
    id: 'SSN',
    label: 'Social Security Number (no dashes)',
    pattern: /\bSSN\s*[:#]?\s*\d{9}\b/i,
    confidence: 'high',
  },

  // ── 2. Phone / Fax ─────────────────────────────────────────────────────
  {
    id: 'PHONE_FAX',
    label: 'Phone or Fax Number',
    pattern: /\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/,
    confidence: 'high',
  },
  {
    id: 'PHONE_FAX',
    label: 'Phone with label',
    pattern: /\b(?:phone|fax|tel|cell|mobile)\s*[:#]?\s*\+?[\d\s().-]{7,}\b/i,
    confidence: 'high',
  },

  // ── 3. Email ────────────────────────────────────────────────────────────
  {
    id: 'EMAIL',
    label: 'Email Address',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
    confidence: 'high',
  },

  // ── 4. MRN / Medical Record Number ─────────────────────────────────────
  {
    id: 'MRN',
    label: 'Medical Record Number',
    pattern: /\b(?:MRN|medical\s*record)\s*[:#]?\s*\d{4,12}\b/i,
    confidence: 'high',
  },

  // ── 5. Account Numbers ─────────────────────────────────────────────────
  {
    id: 'ACCOUNT_NUMBER',
    label: 'Account Number',
    pattern: /\b(?:account|acct)\s*[:#]?\s*\d{6,}\b/i,
    confidence: 'high',
  },

  // ── 6. License / DEA Numbers ───────────────────────────────────────────
  {
    id: 'LICENSE_NUMBER',
    label: 'DEA Number',
    pattern: /\bDEA\s*[:#]?\s*[A-Z]{2}\d{7}\b/i,
    confidence: 'high',
  },
  {
    id: 'LICENSE_NUMBER',
    label: 'License Number',
    pattern: /\b(?:license|lic)\s*[:#]?\s*[A-Z0-9]{5,}\b/i,
    confidence: 'medium',
    contextRequired: HEALTHCARE_CONTEXT,
  },

  // ── 7. Vehicle Identifier (VIN) ────────────────────────────────────────
  {
    id: 'DEVICE_IDENTIFIER',
    label: 'Vehicle Identification Number',
    pattern: /\b[A-HJ-NPR-Z0-9]{17}\b/,
    confidence: 'medium',
    contextRequired: HEALTHCARE_CONTEXT,
  },

  // ── 8. IP Addresses ────────────────────────────────────────────────────
  {
    id: 'IP_ADDRESS',
    label: 'IP Address',
    pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/,
    confidence: 'medium',
    contextRequired: HEALTHCARE_CONTEXT,
  },

  // ── 9. URLs (patient portals, health records) ──────────────────────────
  {
    id: 'URL',
    label: 'Health-related URL',
    pattern:
      /https?:\/\/[^\s]+(?:patient|portal|record|health|chart|ehr|emr|epic|cerner)[^\s]*/i,
    confidence: 'medium',
    contextRequired: HEALTHCARE_CONTEXT,
  },

  // ── 10. Dates (potential DOB, admission, discharge) ────────────────────
  {
    id: 'DATE_OF_BIRTH',
    label: 'Date (potential DOB)',
    pattern: /\b(?:DOB|date\s*of\s*birth|birth\s*date)\s*[:#]?\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/i,
    confidence: 'high',
  },
  {
    id: 'DATE_OF_BIRTH',
    label: 'Date near medical context',
    pattern: /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/,
    confidence: 'medium',
    contextRequired: HEALTHCARE_CONTEXT,
  },

  // ── 11. ZIP Codes ──────────────────────────────────────────────────────
  {
    id: 'GEOGRAPHIC',
    label: 'ZIP Code',
    pattern: /\b\d{5}(?:-\d{4})?\b/,
    confidence: 'medium',
    contextRequired:
      /\b(address|street|city|state|zip|postal|residence|home|lives?\s+(?:at|in|on))\b/i,
  },

  // ── 12. Ages over 89 ──────────────────────────────────────────────────
  {
    id: 'AGE_OVER_89',
    label: 'Age over 89',
    pattern: /\bage[d]?\s*(\d{2,3})\b/i,
    confidence: 'medium',
    contextRequired: HEALTHCARE_CONTEXT,
    validate: (match: string) => {
      const ageMatch = match.match(/\d{2,3}/);
      return ageMatch !== null && parseInt(ageMatch[0], 10) > 89;
    },
  },

  // ── 13. Beneficiary / NPI Numbers ──────────────────────────────────────
  {
    id: 'BENEFICIARY_NUMBER',
    label: 'NPI Number',
    pattern: /\bNPI\s*[:#]?\s*\d{10}\b/i,
    confidence: 'high',
  },
  {
    id: 'BENEFICIARY_NUMBER',
    label: 'Beneficiary Number',
    pattern: /\b(?:beneficiary|member)\s*[:#]?\s*[A-Z0-9]{6,}\b/i,
    confidence: 'medium',
    contextRequired: HEALTHCARE_CONTEXT,
  },

  // ── 14. Certificate Numbers ────────────────────────────────────────────
  {
    id: 'OTHER_UNIQUE_IDENTIFIER',
    label: 'Certificate Number',
    pattern: /\b(?:cert|certificate)\s*[:#]?\s*[A-Z0-9]{4,}\b/i,
    confidence: 'medium',
    contextRequired: HEALTHCARE_CONTEXT,
  },

  // ── 15. Names — deferred to Haiku classifier (no regex) ───────────────
  // Intentionally omitted. Regex cannot reliably detect names without
  // massive false positive rates. The Haiku classifier handles this for
  // high-sensitivity roles.

  // ── 16. Geographic data (sub-state: street addresses) ──────────────────
  {
    id: 'GEOGRAPHIC',
    label: 'Street Address',
    pattern:
      /\b\d+\s+[\w\s]+\b(?:Street|St|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Road|Rd|Court|Ct|Lane|Ln|Way|Circle|Cir|Place|Pl)\b/i,
    confidence: 'low',
    contextRequired: HEALTHCARE_CONTEXT,
  },

  // ── 17. Biometric / Photographic identifiers ──────────────────────────
  {
    id: 'BIOMETRIC',
    label: 'Biometric Identifier',
    pattern:
      /\b(?:fingerprint|retina|voiceprint|facial\s*recognition|iris\s*scan|palm\s*print|photograph|photo\s*id)\b/i,
    confidence: 'low',
    contextRequired: HEALTHCARE_CONTEXT,
  },

  // ── 18. Catch-all: long numeric sequences near healthcare context ─────
  {
    id: 'OTHER_UNIQUE_IDENTIFIER',
    label: 'Unclassified Long Identifier',
    pattern: /\b\d{8,}\b/,
    confidence: 'low',
    contextRequired: HEALTHCARE_CONTEXT,
  },
];

// ---------------------------------------------------------------------------
// Pattern runner
// ---------------------------------------------------------------------------

/**
 * Run all PHI patterns against content. Returns deduplicated list of
 * pattern IDs that matched. Respects contextRequired and validate guards.
 */
export function runPatterns(content: string): string[] {
  const matched = new Set<string>();

  for (const p of PHI_PATTERNS) {
    // Skip if context is required but not present
    if (p.contextRequired && !p.contextRequired.test(content)) continue;

    const m = content.match(p.pattern);
    if (!m) continue;

    // Run optional validator (e.g. age > 89 check)
    if (p.validate && !p.validate(m[0])) continue;

    matched.add(p.id);
  }

  return Array.from(matched);
}
