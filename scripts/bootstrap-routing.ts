/**
 * Generate 300 synthetic cold-start routing records for Council v2.0.
 *
 * Distribution:
 *   Domain:     healthcare 40%, general 25%, personal 20%, homestead 15%
 *   Complexity: simple 35%, moderate 35%, complex 20%, expert 10%
 *   Source:     all synthetic, confidence_weight = 0.5
 */

import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';

const DB_PATH = path.join(os.homedir(), 'ai-shared', 'routing.db');
const RECORD_COUNT = 300;

// ---------------------------------------------------------------------------
// Weighted random helpers
// ---------------------------------------------------------------------------

function weightedPick<T>(items: [T, number][]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [item, weight] of items) {
    r -= weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1][0];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randDate(): string {
  // Random date in past 90 days
  const now = Date.now();
  const offset = Math.random() * 90 * 24 * 60 * 60 * 1000;
  return new Date(now - offset).toISOString();
}

// ---------------------------------------------------------------------------
// Domain and type distributions
// ---------------------------------------------------------------------------

type Domain = 'healthcare' | 'homestead' | 'personal' | 'general';
type TaskType = 'document' | 'research' | 'code' | 'analysis' | 'regulatory' | 'scheduling';
type Complexity = 'simple' | 'moderate' | 'complex' | 'expert';
type Outcome = 'success' | 'retry' | 'fail';

const DOMAINS: [Domain, number][] = [
  ['healthcare', 40],
  ['general', 25],
  ['personal', 20],
  ['homestead', 15],
];

const COMPLEXITY: [Complexity, number][] = [
  ['simple', 35],
  ['moderate', 35],
  ['complex', 20],
  ['expert', 10],
];

// Task type weights per domain
const DOMAIN_TASK_TYPES: Record<Domain, [TaskType, number][]> = {
  healthcare: [
    ['regulatory', 30],
    ['document', 25],
    ['analysis', 20],
    ['research', 15],
    ['scheduling', 10],
    ['code', 0],
  ],
  general: [
    ['research', 30],
    ['analysis', 25],
    ['document', 20],
    ['code', 15],
    ['scheduling', 10],
    ['regulatory', 0],
  ],
  personal: [
    ['scheduling', 30],
    ['research', 25],
    ['document', 20],
    ['analysis', 15],
    ['code', 5],
    ['regulatory', 5],
  ],
  homestead: [
    ['research', 30],
    ['scheduling', 25],
    ['document', 20],
    ['analysis', 15],
    ['code', 10],
    ['regulatory', 0],
  ],
};

// Role selection by task type + complexity
interface RoleModel {
  role: string;
  model: string;
}

const ROLE_MAP: Record<TaskType, Record<Complexity, RoleModel[]>> = {
  regulatory: {
    simple: [
      { role: 'default', model: 'claude-sonnet-4-6' },
    ],
    moderate: [
      { role: 'default', model: 'claude-sonnet-4-6' },
      { role: 'research', model: 'perplexity/sonar-pro' },
    ],
    complex: [
      { role: 'reasoning', model: 'claude-opus-4-6' },
      { role: 'research', model: 'perplexity/sonar-pro' },
    ],
    expert: [
      { role: 'reasoning', model: 'claude-opus-4-6' },
      { role: 'crossValidation', model: 'x-ai/grok-3-beta' },
    ],
  },
  document: {
    simple: [
      { role: 'default', model: 'claude-sonnet-4-6' },
      { role: 'classifier', model: 'nvidia/llama-3.1-nemotron-nano-8b-v1' },
    ],
    moderate: [
      { role: 'default', model: 'claude-sonnet-4-6' },
      { role: 'longContext', model: 'google/gemini-2.5-pro-preview' },
    ],
    complex: [
      { role: 'longContext', model: 'google/gemini-2.5-pro-preview' },
      { role: 'reasoning', model: 'claude-opus-4-6' },
    ],
    expert: [
      { role: 'reasoning', model: 'claude-opus-4-6' },
      { role: 'longContext', model: 'google/gemini-2.5-pro-preview' },
    ],
  },
  research: {
    simple: [
      { role: 'research', model: 'perplexity/sonar-pro' },
    ],
    moderate: [
      { role: 'research', model: 'perplexity/sonar-pro' },
      { role: 'default', model: 'claude-sonnet-4-6' },
    ],
    complex: [
      { role: 'research', model: 'perplexity/sonar-pro' },
      { role: 'reasoning', model: 'claude-opus-4-6' },
    ],
    expert: [
      { role: 'reasoning', model: 'claude-opus-4-6' },
      { role: 'crossValidation', model: 'x-ai/grok-3-beta' },
    ],
  },
  analysis: {
    simple: [
      { role: 'default', model: 'claude-sonnet-4-6' },
      { role: 'subAgent', model: 'nvidia/llama-3.3-nemotron-super-49b-v1' },
    ],
    moderate: [
      { role: 'default', model: 'claude-sonnet-4-6' },
      { role: 'crossValidation', model: 'x-ai/grok-3-beta' },
    ],
    complex: [
      { role: 'reasoning', model: 'claude-opus-4-6' },
      { role: 'crossValidation', model: 'x-ai/grok-3-beta' },
    ],
    expert: [
      { role: 'reasoning', model: 'claude-opus-4-6' },
      { role: 'longContext', model: 'google/gemini-2.5-pro-preview' },
    ],
  },
  code: {
    simple: [
      { role: 'code', model: 'openai/gpt-4.1' },
      { role: 'subAgent', model: 'nvidia/llama-3.3-nemotron-super-49b-v1' },
    ],
    moderate: [
      { role: 'code', model: 'openai/gpt-4.1' },
    ],
    complex: [
      { role: 'code', model: 'openai/gpt-4.1' },
      { role: 'reasoning', model: 'claude-opus-4-6' },
    ],
    expert: [
      { role: 'reasoning', model: 'claude-opus-4-6' },
      { role: 'code', model: 'openai/gpt-4.1' },
    ],
  },
  scheduling: {
    simple: [
      { role: 'classifier', model: 'nvidia/llama-3.1-nemotron-nano-8b-v1' },
      { role: 'subAgent', model: 'nvidia/llama-3.3-nemotron-super-49b-v1' },
    ],
    moderate: [
      { role: 'default', model: 'claude-sonnet-4-6' },
    ],
    complex: [
      { role: 'default', model: 'claude-sonnet-4-6' },
      { role: 'reasoning', model: 'claude-opus-4-6' },
    ],
    expert: [
      { role: 'reasoning', model: 'claude-opus-4-6' },
    ],
  },
};

// Token and latency profiles per complexity
const PROFILES: Record<Complexity, { tokIn: [number, number]; tokOut: [number, number]; latMs: [number, number] }> = {
  simple:   { tokIn: [50, 500],     tokOut: [100, 800],     latMs: [200, 2000] },
  moderate: { tokIn: [300, 2000],   tokOut: [500, 3000],    latMs: [1000, 8000] },
  complex:  { tokIn: [1000, 8000],  tokOut: [2000, 10000],  latMs: [5000, 30000] },
  expert:   { tokIn: [3000, 20000], tokOut: [5000, 25000],  latMs: [15000, 90000] },
};

// Pricing per 1M tokens (prompt / completion)
const PRICING: Record<string, [number, number]> = {
  'claude-sonnet-4-6':                      [3.0, 15.0],
  'claude-opus-4-6':                        [15.0, 75.0],
  'claude-haiku-4-5-20251001':              [0.8, 4.0],
  'google/gemini-2.5-pro-preview':          [1.25, 10.0],
  'openai/gpt-4.1':                         [2.0, 8.0],
  'perplexity/sonar-pro':                   [3.0, 15.0],
  'x-ai/grok-3-beta':                       [3.0, 15.0],
  'nvidia/llama-3.3-nemotron-super-49b-v1': [0.2, 0.3],
  'nvidia/llama-3.1-nemotron-nano-8b-v1':   [0.07, 0.07],
  'dall-e-3':                               [0, 0],
};

function computeCost(model: string, tokIn: number, tokOut: number): number {
  const [pIn, pOut] = PRICING[model] || [1.0, 1.0];
  return (tokIn / 1_000_000) * pIn + (tokOut / 1_000_000) * pOut;
}

// Outcome weights by complexity
const OUTCOME_WEIGHTS: Record<Complexity, [Outcome, number][]> = {
  simple:   [['success', 92], ['retry', 6], ['fail', 2]],
  moderate: [['success', 85], ['retry', 10], ['fail', 5]],
  complex:  [['success', 75], ['retry', 17], ['fail', 8]],
  expert:   [['success', 65], ['retry', 22], ['fail', 13]],
};

// Rating weights by outcome
function pickRating(outcome: Outcome): number | null {
  // 60% of records have a rating
  if (Math.random() > 0.6) return null;
  if (outcome === 'success') return weightedPick([[5, 40], [4, 35], [3, 20], [2, 4], [1, 1]]);
  if (outcome === 'retry')   return weightedPick([[5, 10], [4, 20], [3, 40], [2, 25], [1, 5]]);
  return weightedPick([[5, 2], [4, 5], [3, 15], [2, 38], [1, 40]]);
}

// ---------------------------------------------------------------------------
// Generate
// ---------------------------------------------------------------------------

function generate(): void {
  const db = new Database(DB_PATH);

  const existing = (db.prepare('SELECT COUNT(*) as n FROM routing_records WHERE source = ?').get('synthetic') as { n: number }).n;
  if (existing >= RECORD_COUNT) {
    console.log(`Already have ${existing} synthetic records — skipping.`);
    db.close();
    return;
  }

  const insert = db.prepare(`
    INSERT INTO routing_records
      (timestamp, task_domain, task_type, complexity, model_used, role_id,
       tokens_in, tokens_out, latency_ms, cost_usd, outcome, user_rating,
       source, confidence_weight)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synthetic', 0.5)
  `);

  const tx = db.transaction(() => {
    for (let i = 0; i < RECORD_COUNT; i++) {
      const domain = weightedPick(DOMAINS);
      const complexity = weightedPick(COMPLEXITY);
      const taskType = weightedPick(DOMAIN_TASK_TYPES[domain]);
      const outcome = weightedPick(OUTCOME_WEIGHTS[complexity]);

      const candidates = ROLE_MAP[taskType][complexity];
      const { role, model } = candidates[randInt(0, candidates.length - 1)];

      const prof = PROFILES[complexity];
      const tokIn = randInt(...prof.tokIn);
      const tokOut = randInt(...prof.tokOut);
      const latMs = randInt(...prof.latMs);
      const cost = computeCost(model, tokIn, tokOut);
      const rating = pickRating(outcome);

      insert.run(
        randDate(),
        domain,
        taskType,
        complexity,
        model,
        role,
        tokIn,
        tokOut,
        latMs,
        parseFloat(cost.toFixed(6)),
        outcome,
        rating,
      );
    }
  });

  tx();
  db.close();

  console.log(`Generated ${RECORD_COUNT} synthetic routing records.`);
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

function printStats(): void {
  const db = new Database(DB_PATH, { readonly: true });

  console.log('\n--- Domain Distribution ---');
  const domains = db.prepare(`
    SELECT task_domain, COUNT(*) as n, ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM routing_records), 1) as pct
    FROM routing_records GROUP BY task_domain ORDER BY n DESC
  `).all() as { task_domain: string; n: number; pct: number }[];
  console.table(domains);

  console.log('--- Complexity Distribution ---');
  const complexity = db.prepare(`
    SELECT complexity, COUNT(*) as n, ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM routing_records), 1) as pct
    FROM routing_records GROUP BY complexity ORDER BY n DESC
  `).all() as { complexity: string; n: number; pct: number }[];
  console.table(complexity);

  console.log('--- Role Usage ---');
  const roles = db.prepare(`
    SELECT role_id, model_used, COUNT(*) as n
    FROM routing_records GROUP BY role_id, model_used ORDER BY n DESC
  `).all() as { role_id: string; model_used: string; n: number }[];
  console.table(roles);

  console.log('--- Outcome Distribution ---');
  const outcomes = db.prepare(`
    SELECT outcome, COUNT(*) as n, ROUND(AVG(cost_usd), 6) as avg_cost, ROUND(AVG(latency_ms)) as avg_latency
    FROM routing_records GROUP BY outcome ORDER BY n DESC
  `).all() as { outcome: string; n: number; avg_cost: number; avg_latency: number }[];
  console.table(outcomes);

  console.log('--- Source / Confidence ---');
  const source = db.prepare(`
    SELECT source, confidence_weight, COUNT(*) as n FROM routing_records GROUP BY source, confidence_weight
  `).all();
  console.table(source);

  db.close();
}

generate();
printStats();
