/**
 * Dynamic Model Registry — Council v2.0
 *
 * Manages role-based model assignments with auto-promotion for non-locked roles.
 * Locked roles (Anthropic models) are never auto-replaced.
 * Non-locked roles scan the OpenRouter catalog daily at 6am CT and auto-promote
 * if a better model is found based on context window, pricing, and capability.
 *
 * Assignments persist in ~/ai-shared/routing.db (SQLite).
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';

import { logger } from '../logger.js';
import { readEnvFile } from '../env.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RoleName =
  | 'default'
  | 'reasoning'
  | 'longContext'
  | 'code'
  | 'research'
  | 'crossValidation'
  | 'subAgent'
  | 'classifier'
  | 'image'
  | 'phi_fallback';

export interface ModelAssignment {
  role: RoleName;
  modelId: string;
  provider: string;
  locked: boolean;
  contextWindow: number | null;
  promptPricePer1m: number | null;
  completionPricePer1m: number | null;
  lastPromoted: string | null;
  promotedFrom: string | null;
}

interface OpenRouterModel {
  id: string;
  name: string;
  context_length: number;
  pricing: { prompt: string; completion: string };
  architecture?: { modality?: string };
}

interface CatalogScanResult {
  role: RoleName;
  previous: string;
  promoted: string;
  reason: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HOME = process.env.HOME || os.homedir();
const DB_PATH = path.join(HOME, 'ai-shared', 'routing.db');
const OPENROUTER_CATALOG_URL = 'https://openrouter.ai/api/v1/models';

const SEED_ASSIGNMENTS: ModelAssignment[] = [
  {
    role: 'default',
    modelId: 'claude-sonnet-4-6',
    provider: 'anthropic',
    locked: true,
    contextWindow: 200000,
    promptPricePer1m: 3.0,
    completionPricePer1m: 15.0,
    lastPromoted: null,
    promotedFrom: null,
  },
  {
    role: 'reasoning',
    modelId: 'claude-opus-4-6',
    provider: 'anthropic',
    locked: true,
    contextWindow: 1000000,
    promptPricePer1m: 15.0,
    completionPricePer1m: 75.0,
    lastPromoted: null,
    promotedFrom: null,
  },
  {
    role: 'phi_fallback',
    modelId: 'claude-haiku-4-5-20251001',
    provider: 'anthropic',
    locked: true,
    contextWindow: 200000,
    promptPricePer1m: 0.8,
    completionPricePer1m: 4.0,
    lastPromoted: null,
    promotedFrom: null,
  },
  {
    role: 'longContext',
    modelId: 'google/gemini-2.5-pro-preview',
    provider: 'openrouter',
    locked: false,
    contextWindow: 1000000,
    promptPricePer1m: 1.25,
    completionPricePer1m: 10.0,
    lastPromoted: null,
    promotedFrom: null,
  },
  {
    role: 'code',
    modelId: 'openai/gpt-4.1',
    provider: 'openrouter',
    locked: false,
    contextWindow: 1000000,
    promptPricePer1m: 2.0,
    completionPricePer1m: 8.0,
    lastPromoted: null,
    promotedFrom: null,
  },
  {
    role: 'research',
    modelId: 'perplexity/sonar-pro',
    provider: 'openrouter',
    locked: false,
    contextWindow: 200000,
    promptPricePer1m: 3.0,
    completionPricePer1m: 15.0,
    lastPromoted: null,
    promotedFrom: null,
  },
  {
    role: 'crossValidation',
    modelId: 'x-ai/grok-3-beta',
    provider: 'openrouter',
    locked: false,
    contextWindow: 131072,
    promptPricePer1m: 3.0,
    completionPricePer1m: 15.0,
    lastPromoted: null,
    promotedFrom: null,
  },
  {
    role: 'subAgent',
    modelId: 'nvidia/llama-3.3-nemotron-super-49b-v1',
    provider: 'openrouter',
    locked: false,
    contextWindow: 131072,
    promptPricePer1m: 0.2,
    completionPricePer1m: 0.3,
    lastPromoted: null,
    promotedFrom: null,
  },
  {
    role: 'classifier',
    modelId: 'nvidia/llama-3.1-nemotron-nano-8b-v1',
    provider: 'openrouter',
    locked: false,
    contextWindow: 131072,
    promptPricePer1m: 0.07,
    completionPricePer1m: 0.07,
    lastPromoted: null,
    promotedFrom: null,
  },
  {
    role: 'image',
    modelId: 'dall-e-3',
    provider: 'openai',
    locked: false,
    contextWindow: null,
    promptPricePer1m: null,
    completionPricePer1m: null,
    lastPromoted: null,
    promotedFrom: null,
  },
];

// Which model family each non-locked role should track for upgrades.
// The scanner filters catalog models by prefix match on these patterns.
const ROLE_FAMILY_PATTERNS: Partial<Record<RoleName, string[]>> = {
  longContext: ['google/gemini'],
  code: ['openai/gpt'],
  research: ['perplexity/sonar'],
  crossValidation: ['x-ai/grok'],
  subAgent: ['nvidia/llama-3.3-nemotron-super', 'nvidia/nemotron-super'],
  classifier: ['nvidia/llama-3.1-nemotron-nano', 'nvidia/nemotron-nano'],
};

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

let db: Database.Database;

function getDb(): Database.Database {
  if (db) return db;

  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS model_assignments (
      role          TEXT PRIMARY KEY,
      model_id      TEXT NOT NULL,
      provider      TEXT NOT NULL,
      locked        INTEGER NOT NULL DEFAULT 0,
      context_window         INTEGER,
      prompt_price_per_1m    REAL,
      completion_price_per_1m REAL,
      last_promoted TEXT,
      promoted_from TEXT
    );

    CREATE TABLE IF NOT EXISTS scan_history (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      scanned_at TEXT NOT NULL,
      role       TEXT NOT NULL,
      previous   TEXT NOT NULL,
      promoted   TEXT NOT NULL,
      reason     TEXT
    );

    CREATE TABLE IF NOT EXISTS routing_records (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp         TEXT NOT NULL,
      task_domain       TEXT NOT NULL CHECK (task_domain IN ('healthcare','homestead','personal','general')),
      task_type         TEXT NOT NULL CHECK (task_type IN ('document','research','code','analysis','regulatory','scheduling')),
      complexity        TEXT NOT NULL CHECK (complexity IN ('simple','moderate','complex','expert')),
      model_used        TEXT NOT NULL,
      role_id           TEXT NOT NULL,
      tokens_in         INTEGER NOT NULL,
      tokens_out        INTEGER NOT NULL,
      latency_ms        INTEGER NOT NULL,
      cost_usd          REAL NOT NULL,
      outcome           TEXT NOT NULL CHECK (outcome IN ('success','retry','fail')),
      user_rating       INTEGER CHECK (user_rating BETWEEN 1 AND 5),
      source            TEXT NOT NULL CHECK (source IN ('synthetic','live')),
      confidence_weight REAL NOT NULL DEFAULT 1.0
    );

    CREATE INDEX IF NOT EXISTS idx_routing_domain ON routing_records(task_domain);
    CREATE INDEX IF NOT EXISTS idx_routing_role ON routing_records(role_id);
    CREATE INDEX IF NOT EXISTS idx_routing_source ON routing_records(source);
  `);

  // Seed if empty
  const count = db.prepare('SELECT COUNT(*) as n FROM model_assignments').get() as { n: number };
  if (count.n === 0) {
    const insert = db.prepare(`
      INSERT INTO model_assignments
        (role, model_id, provider, locked, context_window, prompt_price_per_1m, completion_price_per_1m, last_promoted, promoted_from)
      VALUES
        (@role, @modelId, @provider, @locked, @contextWindow, @promptPricePer1m, @completionPricePer1m, @lastPromoted, @promotedFrom)
    `);
    const seed = db.transaction(() => {
      for (const a of SEED_ASSIGNMENTS) {
        insert.run({
          role: a.role,
          modelId: a.modelId,
          provider: a.provider,
          locked: a.locked ? 1 : 0,
          contextWindow: a.contextWindow,
          promptPricePer1m: a.promptPricePer1m,
          completionPricePer1m: a.completionPricePer1m,
          lastPromoted: a.lastPromoted,
          promotedFrom: a.promotedFrom,
        });
      }
    });
    seed();
    logger.info({ count: SEED_ASSIGNMENTS.length }, 'Model registry seeded');
  }

  return db;
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

export function getAssignment(role: RoleName): ModelAssignment | null {
  const row = getDb()
    .prepare('SELECT * FROM model_assignments WHERE role = ?')
    .get(role) as Record<string, unknown> | undefined;
  return row ? rowToAssignment(row) : null;
}

export function getAllAssignments(): ModelAssignment[] {
  const rows = getDb()
    .prepare('SELECT * FROM model_assignments ORDER BY role')
    .all() as Record<string, unknown>[];
  return rows.map(rowToAssignment);
}

export function getModelForRole(role: RoleName): string {
  const a = getAssignment(role);
  if (!a) throw new Error(`No model assigned to role: ${role}`);
  return a.modelId;
}

function rowToAssignment(row: Record<string, unknown>): ModelAssignment {
  return {
    role: row.role as RoleName,
    modelId: row.model_id as string,
    provider: row.provider as string,
    locked: row.locked === 1,
    contextWindow: row.context_window as number | null,
    promptPricePer1m: row.prompt_price_per_1m as number | null,
    completionPricePer1m: row.completion_price_per_1m as number | null,
    lastPromoted: row.last_promoted as string | null,
    promotedFrom: row.promoted_from as string | null,
  };
}

// ---------------------------------------------------------------------------
// Write operations
// ---------------------------------------------------------------------------

export function setAssignment(
  role: RoleName,
  modelId: string,
  provider: string,
  opts?: { locked?: boolean; contextWindow?: number; promptPrice?: number; completionPrice?: number },
): void {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO model_assignments
        (role, model_id, provider, locked, context_window, prompt_price_per_1m, completion_price_per_1m, last_promoted, promoted_from)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      role,
      modelId,
      provider,
      opts?.locked ? 1 : 0,
      opts?.contextWindow ?? null,
      opts?.promptPrice ?? null,
      opts?.completionPrice ?? null,
      null,
      null,
    );
  logger.info({ role, modelId, provider }, 'Model assignment updated');
}

export function lockRole(role: RoleName): void {
  getDb().prepare('UPDATE model_assignments SET locked = 1 WHERE role = ?').run(role);
  logger.info({ role }, 'Role locked');
}

export function unlockRole(role: RoleName): void {
  getDb().prepare('UPDATE model_assignments SET locked = 0 WHERE role = ?').run(role);
  logger.info({ role }, 'Role unlocked');
}

// ---------------------------------------------------------------------------
// OpenRouter catalog scan
// ---------------------------------------------------------------------------

async function fetchCatalog(): Promise<OpenRouterModel[]> {
  const env = readEnvFile(['OPENROUTER_API_KEY']);
  const apiKey = env.OPENROUTER_API_KEY;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const res = await fetch(OPENROUTER_CATALOG_URL, { headers });
  if (!res.ok) {
    throw new Error(`OpenRouter catalog fetch failed: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as { data: OpenRouterModel[] };
  return body.data;
}

function scoreModel(m: OpenRouterModel): number {
  // Higher is better. Weights: context window (normalized), inverse price.
  const ctx = m.context_length || 0;
  const promptPrice = parseFloat(m.pricing?.prompt || '999');
  // Score = context_window / 100k + 1 / (promptPrice + 0.01)
  // This favors larger context and lower price.
  return ctx / 100000 + 1 / (promptPrice + 0.01);
}

function findBestInFamily(catalog: OpenRouterModel[], patterns: string[]): OpenRouterModel | null {
  const candidates = catalog.filter((m) =>
    patterns.some((p) => m.id.startsWith(p)),
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((best, cur) =>
    scoreModel(cur) > scoreModel(best) ? cur : best,
  );
}

export async function scanCatalog(): Promise<CatalogScanResult[]> {
  logger.info('Starting OpenRouter catalog scan');
  const results: CatalogScanResult[] = [];

  let catalog: OpenRouterModel[];
  try {
    catalog = await fetchCatalog();
  } catch (err) {
    logger.error({ err }, 'Catalog scan failed');
    return results;
  }

  logger.info({ modelCount: catalog.length }, 'Catalog fetched');

  const database = getDb();
  const assignments = getAllAssignments();

  for (const assignment of assignments) {
    if (assignment.locked) continue;

    const patterns = ROLE_FAMILY_PATTERNS[assignment.role];
    if (!patterns) continue; // image role has no family pattern — skip

    const best = findBestInFamily(catalog, patterns);
    if (!best || best.id === assignment.modelId) continue;

    const currentInCatalog = catalog.find((m) => m.id === assignment.modelId);
    if (currentInCatalog && scoreModel(best) <= scoreModel(currentInCatalog)) continue;

    const promptPrice = parseFloat(best.pricing?.prompt || '0') * 1000000;
    const completionPrice = parseFloat(best.pricing?.completion || '0') * 1000000;
    const now = new Date().toISOString();

    database
      .prepare(
        `UPDATE model_assignments
         SET model_id = ?, context_window = ?, prompt_price_per_1m = ?, completion_price_per_1m = ?,
             last_promoted = ?, promoted_from = ?
         WHERE role = ?`,
      )
      .run(best.id, best.context_length, promptPrice, completionPrice, now, assignment.modelId, assignment.role);

    database
      .prepare('INSERT INTO scan_history (scanned_at, role, previous, promoted, reason) VALUES (?, ?, ?, ?, ?)')
      .run(now, assignment.role, assignment.modelId, best.id, `score ${scoreModel(best).toFixed(2)} > previous`);

    const result: CatalogScanResult = {
      role: assignment.role,
      previous: assignment.modelId,
      promoted: best.id,
      reason: `context=${best.context_length}, price=$${promptPrice.toFixed(2)}/$${completionPrice.toFixed(2)} per 1M`,
    };
    results.push(result);
    logger.info({ ...result }, 'Model promoted');
  }

  if (results.length === 0) {
    logger.info('Catalog scan complete — no promotions');
  }

  return results;
}

// ---------------------------------------------------------------------------
// Scheduled scan (daily at 6am)
// ---------------------------------------------------------------------------

let scanTimer: ReturnType<typeof setInterval> | null = null;

function msUntilNext6am(): number {
  const now = new Date();
  const next = new Date(now);
  next.setHours(6, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

export function startDailyScan(): void {
  if (scanTimer) return;

  const scheduleNext = () => {
    const ms = msUntilNext6am();
    logger.info({ nextScanIn: `${(ms / 3600000).toFixed(1)}h` }, 'Next catalog scan scheduled');
    scanTimer = setTimeout(async () => {
      await scanCatalog();
      scheduleNext();
    }, ms);
    scanTimer.unref();
  };

  scheduleNext();
}

export function stopDailyScan(): void {
  if (scanTimer) {
    clearTimeout(scanTimer);
    scanTimer = null;
  }
}

// ---------------------------------------------------------------------------
// Manual trigger
// ---------------------------------------------------------------------------

export async function triggerImmediateScan(): Promise<CatalogScanResult[]> {
  logger.info('Manual catalog scan triggered');
  return scanCatalog();
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

export function initRegistry(): void {
  getDb(); // ensure schema + seed
  startDailyScan();
  logger.info({ dbPath: DB_PATH }, 'Model registry initialized');
}
