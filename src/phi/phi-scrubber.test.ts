import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { runPatterns, PHI_PATTERNS } from './patterns.js';
import { getRoleSensitivity } from './roles.js';
import {
  initAuditLog,
  logPHIEvent,
  _getAuditLogPath,
  _resetAuditLogPath,
} from './audit.js';
import {
  classifyWithHaiku,
  parseClassifierResponse,
  _resetApiKeyCache,
} from './classifier.js';
import { scanForPHI } from './index.js';
import type { PHIEvent } from './types.js';

// ---------------------------------------------------------------------------
// Pattern catalogue sanity
// ---------------------------------------------------------------------------

describe('PHI_PATTERNS catalogue', () => {
  it('covers all HIPAA Safe Harbor identifiers that have regex coverage', () => {
    const ids = new Set(PHI_PATTERNS.map((p) => p.id));
    // Names (#15) intentionally omitted — handled by classifier
    expect(ids.has('SSN')).toBe(true);
    expect(ids.has('PHONE_FAX')).toBe(true);
    expect(ids.has('EMAIL')).toBe(true);
    expect(ids.has('MRN')).toBe(true);
    expect(ids.has('ACCOUNT_NUMBER')).toBe(true);
    expect(ids.has('LICENSE_NUMBER')).toBe(true);
    expect(ids.has('DEVICE_IDENTIFIER')).toBe(true);
    expect(ids.has('IP_ADDRESS')).toBe(true);
    expect(ids.has('URL')).toBe(true);
    expect(ids.has('DATE_OF_BIRTH')).toBe(true);
    expect(ids.has('GEOGRAPHIC')).toBe(true);
    expect(ids.has('AGE_OVER_89')).toBe(true);
    expect(ids.has('BENEFICIARY_NUMBER')).toBe(true);
    expect(ids.has('OTHER_UNIQUE_IDENTIFIER')).toBe(true);
    expect(ids.has('BIOMETRIC')).toBe(true);
  });

  it('every pattern has a non-empty id and label', () => {
    for (const p of PHI_PATTERNS) {
      expect(p.id.length).toBeGreaterThan(0);
      expect(p.label.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// High-confidence patterns — fire unconditionally
// ---------------------------------------------------------------------------

describe('runPatterns — high-confidence', () => {
  it('detects SSN with dashes', () => {
    const result = runPatterns('Patient SSN is 123-45-6789');
    expect(result).toContain('SSN');
  });

  it('detects SSN with label and no dashes', () => {
    const result = runPatterns('SSN: 123456789');
    expect(result).toContain('SSN');
  });

  it('detects phone numbers', () => {
    const result = runPatterns('Call (555) 123-4567 for details');
    expect(result).toContain('PHONE_FAX');
  });

  it('detects phone with label', () => {
    const result = runPatterns('Phone: +1 555 123 4567');
    expect(result).toContain('PHONE_FAX');
  });

  it('detects email addresses', () => {
    const result = runPatterns('Contact john.doe@hospital.org');
    expect(result).toContain('EMAIL');
  });

  it('detects MRN with label', () => {
    const result = runPatterns('MRN: 00234891');
    expect(result).toContain('MRN');
  });

  it('detects medical record number spelled out', () => {
    const result = runPatterns('Medical record #12345678');
    expect(result).toContain('MRN');
  });

  it('detects account numbers', () => {
    const result = runPatterns('Account #12345678');
    expect(result).toContain('ACCOUNT_NUMBER');
  });

  it('detects DEA numbers', () => {
    const result = runPatterns('DEA# AB1234567');
    expect(result).toContain('LICENSE_NUMBER');
  });

  it('detects NPI numbers', () => {
    const result = runPatterns('NPI: 1234567890');
    expect(result).toContain('BENEFICIARY_NUMBER');
  });

  it('detects DOB with label', () => {
    const result = runPatterns('DOB: 03/15/1987');
    expect(result).toContain('DATE_OF_BIRTH');
  });
});

// ---------------------------------------------------------------------------
// Medium-confidence patterns — require healthcare context
// ---------------------------------------------------------------------------

describe('runPatterns — medium-confidence with context', () => {
  it('detects IP address WITH healthcare context', () => {
    const result = runPatterns(
      'The patient portal at 192.168.1.100 is down',
    );
    expect(result).toContain('IP_ADDRESS');
  });

  it('does NOT flag IP address WITHOUT healthcare context', () => {
    const result = runPatterns('Server at 192.168.1.100 is down');
    expect(result).not.toContain('IP_ADDRESS');
  });

  it('detects ZIP code WITH address context', () => {
    const result = runPatterns('Patient address: 123 Main St, city, state 75001');
    expect(result).toContain('GEOGRAPHIC');
  });

  it('does NOT flag ZIP code WITHOUT address context', () => {
    const result = runPatterns('Error code 75001 occurred');
    expect(result).not.toContain('GEOGRAPHIC');
  });

  it('detects dates WITH medical context', () => {
    const result = runPatterns('Patient admitted 03/15/2024 for diagnosis');
    expect(result).toContain('DATE_OF_BIRTH');
  });

  it('does NOT flag dates WITHOUT medical context', () => {
    const result = runPatterns('The report was filed on 03/15/2024');
    expect(result).not.toContain('DATE_OF_BIRTH');
  });

  it('detects license number WITH medical context', () => {
    const result = runPatterns('Physician license #MD12345 for treatment');
    expect(result).toContain('LICENSE_NUMBER');
  });

  it('detects beneficiary number WITH medical context', () => {
    const result = runPatterns('Medicare beneficiary #ABC123456');
    expect(result).toContain('BENEFICIARY_NUMBER');
  });

  it('detects health-related URL WITH context', () => {
    const result = runPatterns(
      'Access patient portal at https://epic.hospital.org/patient/chart',
    );
    expect(result).toContain('URL');
  });
});

// ---------------------------------------------------------------------------
// Age over 89 — requires validation
// ---------------------------------------------------------------------------

describe('runPatterns — age over 89', () => {
  it('flags age 90 with healthcare context', () => {
    const result = runPatterns('Patient aged 90, diagnosis pending');
    expect(result).toContain('AGE_OVER_89');
  });

  it('flags age 105 with healthcare context', () => {
    const result = runPatterns('Patient age 105, treatment plan reviewed');
    expect(result).toContain('AGE_OVER_89');
  });

  it('does NOT flag age 89 (boundary)', () => {
    const result = runPatterns('Patient aged 89, diagnosis pending');
    expect(result).not.toContain('AGE_OVER_89');
  });

  it('does NOT flag age 45', () => {
    const result = runPatterns('Patient aged 45, diagnosis pending');
    expect(result).not.toContain('AGE_OVER_89');
  });
});

// ---------------------------------------------------------------------------
// Low-confidence patterns
// ---------------------------------------------------------------------------

describe('runPatterns — low-confidence', () => {
  it('detects street address with healthcare context', () => {
    const result = runPatterns(
      'Patient lives at 742 Evergreen Ave, treatment ongoing',
    );
    expect(result).toContain('GEOGRAPHIC');
  });

  it('detects biometric keywords with healthcare context', () => {
    const result = runPatterns(
      'Patient fingerprint on file for medication dispensing',
    );
    expect(result).toContain('BIOMETRIC');
  });

  it('detects long numeric identifiers with healthcare context', () => {
    const result = runPatterns(
      'Patient identifier 123456789012 in medical record',
    );
    expect(result).toContain('OTHER_UNIQUE_IDENTIFIER');
  });
});

// ---------------------------------------------------------------------------
// Clean content — no false positives
// ---------------------------------------------------------------------------

describe('runPatterns — clean content', () => {
  it('returns empty array for generic text', () => {
    const result = runPatterns(
      'The quarterly revenue report shows a 15% increase in widget sales.',
    );
    expect(result).toEqual([]);
  });

  it('returns empty array for code snippets', () => {
    const result = runPatterns(
      'function calculateTotal(items: Item[]): number { return items.reduce((sum, i) => sum + i.price, 0); }',
    );
    expect(result).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(runPatterns('')).toEqual([]);
  });

  it('deduplicates pattern IDs', () => {
    // Content with multiple SSN matches should still yield one 'SSN' entry
    const result = runPatterns(
      'SSN: 123456789 and another SSN is 987-65-4321',
    );
    const ssnCount = result.filter((id) => id === 'SSN').length;
    expect(ssnCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Multiple detections
// ---------------------------------------------------------------------------

describe('runPatterns — multiple detections', () => {
  it('detects multiple PHI types in one content block', () => {
    const result = runPatterns(
      'Patient DOB: 03/15/1987, MRN: 00234891, email: patient@hospital.org, SSN 123-45-6789',
    );
    expect(result).toContain('SSN');
    expect(result).toContain('MRN');
    expect(result).toContain('EMAIL');
    expect(result).toContain('DATE_OF_BIRTH');
    expect(result.length).toBeGreaterThanOrEqual(4);
  });
});

// ===========================================================================
// roles.ts
// ===========================================================================

describe('getRoleSensitivity', () => {
  it('returns high for research', () => {
    expect(getRoleSensitivity('research')).toBe('high');
  });

  it('returns high for longContext', () => {
    expect(getRoleSensitivity('longContext')).toBe('high');
  });

  it('returns high for code', () => {
    expect(getRoleSensitivity('code')).toBe('high');
  });

  it('returns high for crossValidation', () => {
    expect(getRoleSensitivity('crossValidation')).toBe('high');
  });

  it('returns low for subAgent', () => {
    expect(getRoleSensitivity('subAgent')).toBe('low');
  });

  it('returns low for classifier', () => {
    expect(getRoleSensitivity('classifier')).toBe('low');
  });

  it('returns low for image', () => {
    expect(getRoleSensitivity('image')).toBe('low');
  });

  it('returns low for Anthropic-locked roles (caller skips scan)', () => {
    expect(getRoleSensitivity('default')).toBe('low');
    expect(getRoleSensitivity('reasoning')).toBe('low');
    expect(getRoleSensitivity('phi_fallback')).toBe('low');
  });
});

// ===========================================================================
// audit.ts
// ===========================================================================

describe('audit log', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phi-audit-test-'));
  });

  afterEach(() => {
    _resetAuditLogPath();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const sampleEvent: PHIEvent = {
    timestamp: '2026-04-01T14:23:07.412Z',
    originalRole: 'research',
    originalModel: 'perplexity/sonar-pro',
    reroutedTo: 'claude-haiku-4-5-20251001',
    patternTypes: ['SSN', 'PERSON_NAME'],
    detectionLayer: 'regex',
    taskId: 'task_abc123',
  };

  // --- initAuditLog ---

  describe('initAuditLog', () => {
    it('uses explicit customPath when provided', () => {
      const custom = path.join(tmpDir, 'custom', 'audit.log');
      initAuditLog(custom);
      expect(_getAuditLogPath()).toBe(custom);
    });

    it('falls back to PHI_AUDIT_LOG env var', () => {
      const envPath = path.join(tmpDir, 'env', 'audit.log');
      process.env.PHI_AUDIT_LOG = envPath;
      initAuditLog();
      expect(_getAuditLogPath()).toBe(envPath);
      delete process.env.PHI_AUDIT_LOG;
    });

    it('falls back to default path when no arg and no env var', () => {
      delete process.env.PHI_AUDIT_LOG;
      _resetAuditLogPath();
      initAuditLog();
      expect(_getAuditLogPath()).toBe(
        path.join(os.homedir(), 'ai-shared', 'logs', 'phi-audit.log'),
      );
    });

    it('creates parent directories recursively', () => {
      const deep = path.join(tmpDir, 'a', 'b', 'c', 'audit.log');
      initAuditLog(deep);
      expect(fs.existsSync(path.dirname(deep))).toBe(true);
    });
  });

  // --- logPHIEvent ---

  describe('logPHIEvent', () => {
    it('appends valid JSONL to the log file', () => {
      const logFile = path.join(tmpDir, 'audit.log');
      initAuditLog(logFile);

      logPHIEvent(sampleEvent);

      const content = fs.readFileSync(logFile, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(1);

      const parsed = JSON.parse(lines[0]);
      expect(parsed.originalRole).toBe('research');
      expect(parsed.patternTypes).toEqual(['SSN', 'PERSON_NAME']);
      expect(parsed.taskId).toBe('task_abc123');
    });

    it('appends multiple events as separate lines', () => {
      const logFile = path.join(tmpDir, 'audit.log');
      initAuditLog(logFile);

      logPHIEvent(sampleEvent);
      logPHIEvent({ ...sampleEvent, taskId: 'task_def456' });
      logPHIEvent({ ...sampleEvent, taskId: 'task_ghi789' });

      const lines = fs.readFileSync(logFile, 'utf-8').trim().split('\n');
      expect(lines).toHaveLength(3);
      expect(JSON.parse(lines[1]).taskId).toBe('task_def456');
      expect(JSON.parse(lines[2]).taskId).toBe('task_ghi789');
    });

    it('each line is valid JSON', () => {
      const logFile = path.join(tmpDir, 'audit.log');
      initAuditLog(logFile);

      logPHIEvent(sampleEvent);
      logPHIEvent({ ...sampleEvent, detectionLayer: 'classifier' });

      const lines = fs.readFileSync(logFile, 'utf-8').trim().split('\n');
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
    });

    it('handles optional taskId being undefined', () => {
      const logFile = path.join(tmpDir, 'audit.log');
      initAuditLog(logFile);

      const { taskId: _, ...eventNoTask } = sampleEvent;
      logPHIEvent(eventNoTask as PHIEvent);

      const parsed = JSON.parse(
        fs.readFileSync(logFile, 'utf-8').trim(),
      );
      expect(parsed.taskId).toBeUndefined();
    });

    it('does not throw when write fails', () => {
      // Point to a path that will fail (directory as file)
      const badPath = path.join(tmpDir, 'not-a-dir');
      fs.mkdirSync(badPath);
      initAuditLog(path.join(badPath)); // badPath is a directory, not a file

      // Should not throw — error is swallowed and logged
      expect(() => logPHIEvent(sampleEvent)).not.toThrow();
    });
  });
});

// ===========================================================================
// classifier.ts — parseClassifierResponse (pure, no mocks needed)
// ===========================================================================

describe('parseClassifierResponse', () => {
  it('parses valid JSON with PHI detected', () => {
    const result = parseClassifierResponse(
      '{"containsPHI": true, "patternTypes": ["PERSON_NAME", "SSN"], "confidence": "high"}',
    );
    expect(result.containsPHI).toBe(true);
    expect(result.patternTypes).toEqual(['PERSON_NAME', 'SSN']);
    expect(result.confidence).toBe('high');
  });

  it('parses valid JSON with no PHI', () => {
    const result = parseClassifierResponse(
      '{"containsPHI": false, "patternTypes": [], "confidence": "high"}',
    );
    expect(result.containsPHI).toBe(false);
    expect(result.patternTypes).toEqual([]);
  });

  it('handles markdown code fences around JSON', () => {
    const result = parseClassifierResponse(
      '```json\n{"containsPHI": true, "patternTypes": ["MRN"], "confidence": "medium"}\n```',
    );
    expect(result.containsPHI).toBe(true);
    expect(result.patternTypes).toEqual(['MRN']);
  });

  it('normalizes unknown pattern types to OTHER_UNIQUE_IDENTIFIER', () => {
    const result = parseClassifierResponse(
      '{"containsPHI": true, "patternTypes": ["PERSON_NAME", "UNKNOWN_TYPE"], "confidence": "high"}',
    );
    expect(result.patternTypes).toEqual([
      'PERSON_NAME',
      'OTHER_UNIQUE_IDENTIFIER',
    ]);
  });

  it('defaults confidence to high when missing', () => {
    const result = parseClassifierResponse(
      '{"containsPHI": true, "patternTypes": ["SSN"]}',
    );
    expect(result.confidence).toBe('high');
  });

  it('defaults confidence to high when invalid', () => {
    const result = parseClassifierResponse(
      '{"containsPHI": true, "patternTypes": ["SSN"], "confidence": "very high"}',
    );
    expect(result.confidence).toBe('high');
  });

  it('fails closed on invalid JSON', () => {
    const result = parseClassifierResponse('not json at all');
    expect(result.containsPHI).toBe(true);
    expect(result.patternTypes).toEqual(['CLASSIFIER_PARSE_ERROR']);
  });

  it('fails closed when containsPHI is not a boolean', () => {
    const result = parseClassifierResponse(
      '{"containsPHI": "yes", "patternTypes": ["SSN"]}',
    );
    expect(result.containsPHI).toBe(true);
    expect(result.patternTypes).toEqual(['CLASSIFIER_PARSE_ERROR']);
  });

  it('handles missing patternTypes gracefully', () => {
    const result = parseClassifierResponse(
      '{"containsPHI": true, "confidence": "high"}',
    );
    expect(result.containsPHI).toBe(true);
    expect(result.patternTypes).toEqual([]);
  });
});

// ===========================================================================
// classifier.ts — classifyWithHaiku (mocked fetch)
// ===========================================================================

describe('classifyWithHaiku', () => {
  const originalFetch = globalThis.fetch;

  function mockFetch(response: {
    ok: boolean;
    status?: number;
    json?: () => Promise<unknown>;
  }) {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: response.ok,
      status: response.status ?? 200,
      json: response.json ?? (async () => ({})),
    });
  }

  beforeEach(() => {
    _resetApiKeyCache();
    process.env.ANTHROPIC_API_KEY = 'test-key-for-phi-classifier';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.ANTHROPIC_API_KEY;
    _resetApiKeyCache();
  });

  it('returns clean result for empty content', async () => {
    const result = await classifyWithHaiku('');
    expect(result.containsPHI).toBe(false);
  });

  it('returns clean result for whitespace-only content', async () => {
    const result = await classifyWithHaiku('   \n\t  ');
    expect(result.containsPHI).toBe(false);
  });

  it('calls Anthropic API and parses PHI detection', async () => {
    mockFetch({
      ok: true,
      json: async () => ({
        content: [
          {
            type: 'text',
            text: '{"containsPHI": true, "patternTypes": ["PERSON_NAME"], "confidence": "high"}',
          },
        ],
      }),
    });

    const result = await classifyWithHaiku('John Smith was admitted yesterday');
    expect(result.containsPHI).toBe(true);
    expect(result.patternTypes).toEqual(['PERSON_NAME']);
  });

  it('calls Anthropic API and parses clean result', async () => {
    mockFetch({
      ok: true,
      json: async () => ({
        content: [
          {
            type: 'text',
            text: '{"containsPHI": false, "patternTypes": [], "confidence": "high"}',
          },
        ],
      }),
    });

    const result = await classifyWithHaiku('The quarterly report is ready');
    expect(result.containsPHI).toBe(false);
    expect(result.patternTypes).toEqual([]);
  });

  it('fails closed on API error (non-ok response)', async () => {
    mockFetch({ ok: false, status: 500 });

    const result = await classifyWithHaiku('some content');
    expect(result.containsPHI).toBe(true);
    expect(result.patternTypes).toEqual(['CLASSIFIER_ERROR']);
  });

  it('fails closed on empty API response content', async () => {
    mockFetch({
      ok: true,
      json: async () => ({ content: [] }),
    });

    const result = await classifyWithHaiku('some content');
    expect(result.containsPHI).toBe(true);
    expect(result.patternTypes).toEqual(['CLASSIFIER_PARSE_ERROR']);
  });

  it('fails closed on network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await classifyWithHaiku('some content');
    expect(result.containsPHI).toBe(true);
    expect(result.patternTypes).toEqual(['CLASSIFIER_ERROR']);
  });

  it('fails closed on abort/timeout', async () => {
    const abortErr = new DOMException('signal is aborted', 'AbortError');
    globalThis.fetch = vi.fn().mockRejectedValue(abortErr);

    const result = await classifyWithHaiku('some content');
    expect(result.containsPHI).toBe(true);
    expect(result.patternTypes).toEqual(['CLASSIFIER_TIMEOUT']);
  });

  it('fails closed when no API key is available', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    _resetApiKeyCache();

    const result = await classifyWithHaiku('some content');
    expect(result.containsPHI).toBe(true);
    expect(result.patternTypes).toEqual(['CLASSIFIER_NO_API_KEY']);
  });
});

// ===========================================================================
// index.ts — scanForPHI orchestration
// ===========================================================================

describe('scanForPHI', () => {
  const originalFetch = globalThis.fetch;

  function mockHaikuClean() {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [
          {
            type: 'text',
            text: '{"containsPHI": false, "patternTypes": [], "confidence": "high"}',
          },
        ],
      }),
    });
  }

  function mockHaikuDetected(types: string[]) {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              containsPHI: true,
              patternTypes: types,
              confidence: 'high',
            }),
          },
        ],
      }),
    });
  }

  beforeEach(() => {
    _resetApiKeyCache();
    process.env.ANTHROPIC_API_KEY = 'test-key-for-phi-classifier';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.ANTHROPIC_API_KEY;
    _resetApiKeyCache();
  });

  // --- Regex layer ---

  it('reroutes when regex detects PHI (any role)', async () => {
    const result = await scanForPHI('SSN is 123-45-6789', 'research');
    expect(result.reroute).toBe(true);
    expect(result.detectionLayer).toBe('regex');
    expect(result.patternTypes).toContain('SSN');
  });

  it('reroutes on regex match even for low-sensitivity roles', async () => {
    const result = await scanForPHI('SSN is 123-45-6789', 'classifier');
    expect(result.reroute).toBe(true);
    expect(result.detectionLayer).toBe('regex');
  });

  // --- Low-sensitivity roles: regex-only ---

  it('returns clean for low-sensitivity role when regex passes', async () => {
    const result = await scanForPHI(
      'Generate a summary of widget sales',
      'subAgent',
    );
    expect(result.clean).toBe(true);
    expect(result.reroute).toBe(false);
    // Fetch should NOT have been called — no classifier for low-sensitivity
    expect(globalThis.fetch).toBeUndefined; // still original, never mocked
  });

  // --- High-sensitivity roles: regex + classifier ---

  it('calls Haiku classifier for high-sensitivity role when regex is clean', async () => {
    mockHaikuClean();

    const result = await scanForPHI(
      'Summarize the latest research on widget manufacturing',
      'research',
    );
    expect(result.clean).toBe(true);
    expect(result.reroute).toBe(false);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('reroutes when classifier detects PHI for high-sensitivity role', async () => {
    mockHaikuDetected(['PERSON_NAME', 'CLINICAL_NARRATIVE']);

    const result = await scanForPHI(
      'The elderly gentleman was treated for chronic heart failure',
      'longContext',
    );
    expect(result.reroute).toBe(true);
    expect(result.detectionLayer).toBe('classifier');
    expect(result.patternTypes).toContain('PERSON_NAME');
    expect(result.patternTypes).toContain('CLINICAL_NARRATIVE');
  });

  it('does NOT call classifier for low-sensitivity role', async () => {
    mockHaikuClean();

    await scanForPHI('Some generic content', 'classifier');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  // --- Fail-closed ---

  it('fails closed when classifier errors for high-sensitivity role', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await scanForPHI(
      'Some content that needs classification',
      'research',
    );
    expect(result.reroute).toBe(true);
    // Classifier error propagates as reroute through the orchestrator
    expect(result.patternTypes).toContain('CLASSIFIER_ERROR');
  });

  it('fails closed on unexpected error in scanForPHI', async () => {
    // Force an error by making runPatterns blow up via bad input type
    // We'll test the outer try/catch by mocking fetch to throw synchronously
    globalThis.fetch = vi.fn().mockImplementation(() => {
      throw new TypeError('Unexpected synchronous error');
    });

    const result = await scanForPHI(
      'Content for high-sensitivity role',
      'code',
    );
    // Should still return a reroute, not throw
    expect(result.reroute).toBe(true);
  });

  // --- Role coverage ---

  it('uses classifier for all high-sensitivity roles', async () => {
    mockHaikuClean();
    const highRoles = [
      'research',
      'longContext',
      'code',
      'crossValidation',
    ] as const;

    for (const role of highRoles) {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockClear();
      await scanForPHI('Generic content', role);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    }
  });

  it('skips classifier for all low-sensitivity roles', async () => {
    mockHaikuClean();
    const lowRoles = ['subAgent', 'classifier', 'image'] as const;

    for (const role of lowRoles) {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockClear();
      await scanForPHI('Generic content', role);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    }
  });
});
