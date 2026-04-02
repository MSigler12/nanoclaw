#!/usr/bin/env npx tsx
/**
 * Prompt Caching Acceptance Test
 *
 * Sends two identical prompts to the same group session and measures
 * cache hit rates from the cache-metrics.jsonl output. The acceptance
 * criterion is 90%+ cache read rate on the second prompt.
 *
 * Prerequisites:
 *   - NanoClaw must be running (or at minimum, the container image must be built)
 *   - A registered group must exist (defaults to telegram_main)
 *
 * Usage:
 *   npx tsx scripts/test-prompt-caching.ts [--group <folder>]
 *
 * The script:
 *   1. Clears any existing cache-metrics.jsonl for the test group
 *   2. Sends prompt #1 (cache creation)
 *   3. Sends prompt #2 (identical, expects cache hit)
 *   4. Reads cache-metrics.jsonl entries
 *   5. Compares cache read tokens between run 1 and run 2
 *   6. Reports pass/fail against 90% threshold
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const GROUPS_DIR = path.join(PROJECT_ROOT, 'groups');
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const CONTAINER_IMAGE = 'nanoclaw-agent:latest';

const TEST_PROMPT =
  'Respond with exactly: "Cache test acknowledged." Do not use any tools. Do not read any files. Just respond with that exact phrase.';

const ACCEPTANCE_THRESHOLD = 0.90; // 90% cache hit rate
const CONTAINER_TIMEOUT_MS = 120_000;

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
let groupFolder = 'telegram_main';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--group' && args[i + 1]) {
    groupFolder = args[i + 1];
    i++;
  }
}

const groupDir = path.join(GROUPS_DIR, groupFolder);
const metricsFile = path.join(groupDir, 'logs', 'cache-metrics.jsonl');

// ---------------------------------------------------------------------------
// Container execution (simplified — no OneCLI, minimal mounts)
// ---------------------------------------------------------------------------

interface CacheMetric {
  timestamp: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  cacheHitRate: number;
  costUSD: number;
}

function readMetrics(): CacheMetric[] {
  if (!fs.existsSync(metricsFile)) return [];
  return fs
    .readFileSync(metricsFile, 'utf-8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as CacheMetric);
}

async function runPrompt(
  prompt: string,
  sessionId: string | undefined,
  runLabel: string,
): Promise<{ sessionId: string | undefined }> {
  console.log(`\n[${ runLabel }] Sending prompt...`);

  const groupSessionDir = path.join(DATA_DIR, 'sessions', groupFolder);
  const claudeDir = path.join(groupSessionDir, '.claude');
  const ipcDir = path.join(DATA_DIR, 'ipc', groupFolder);
  const globalDir = path.join(GROUPS_DIR, 'global');

  // Ensure directories exist
  for (const dir of [groupDir, claudeDir, ipcDir, globalDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  for (const sub of ['messages', 'tasks', 'input']) {
    fs.mkdirSync(path.join(ipcDir, sub), { recursive: true });
  }

  const containerInput = {
    prompt,
    sessionId,
    groupFolder,
    chatJid: 'test-cache-acceptance',
    isMain: false,
    assistantName: 'TestAgent',
  };

  return new Promise((resolve, reject) => {
    const containerName = `nanoclaw-cache-test-${Date.now()}`;

    const containerArgs = [
      'run',
      '--rm',
      '--name', containerName,
      '-i',
      // Mounts
      '-v', `${groupDir}:/workspace/group`,
      '-v', `${globalDir}:/workspace/global:ro`,
      '-v', `${claudeDir}:/home/node/.claude`,
      '-v', `${ipcDir}:/workspace/ipc`,
      CONTAINER_IMAGE,
    ];

    const proc = spawn('docker', containerArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: CONTAINER_TIMEOUT_MS,
    });

    let stdout = '';
    let stderr = '';
    let newSessionId: string | undefined;

    proc.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;

      // Parse output markers for session ID
      const markerMatch = text.match(/---NANOCLAW_OUTPUT_START---([\s\S]*?)---NANOCLAW_OUTPUT_END---/);
      if (markerMatch) {
        try {
          const output = JSON.parse(markerMatch[1]);
          if (output.newSessionId) {
            newSessionId = output.newSessionId;
          }
        } catch {
          // ignore parse errors
        }
      }
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`[${runLabel}] Container exited with code ${code}`);
        // Show last few lines of stderr for debugging
        const lines = stderr.trim().split('\n').slice(-5);
        for (const line of lines) {
          console.error(`  ${line}`);
        }
      }
      console.log(`[${runLabel}] Container finished`);
      resolve({ sessionId: newSessionId || sessionId });
    });

    proc.on('error', (err) => {
      reject(new Error(`Container spawn error: ${err.message}`));
    });

    // Write input
    proc.stdin.write(JSON.stringify(containerInput));
    proc.stdin.end();

    // Write close sentinel after a delay to let the agent finish
    setTimeout(() => {
      const closeFile = path.join(ipcDir, 'input', '_close');
      try {
        fs.writeFileSync(closeFile, '');
      } catch {
        // Container may have already exited
      }
    }, 5_000);
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=================================');
  console.log('Prompt Caching Acceptance Test');
  console.log('=================================');
  console.log(`Group:     ${groupFolder}`);
  console.log(`Threshold: ${ACCEPTANCE_THRESHOLD * 100}% cache hit rate`);
  console.log(`Prompt:    "${TEST_PROMPT.slice(0, 60)}..."`);

  // Step 1: Clear existing metrics
  if (fs.existsSync(metricsFile)) {
    fs.unlinkSync(metricsFile);
    console.log('\nCleared existing cache-metrics.jsonl');
  }

  const metricsBefore = readMetrics().length;

  // Step 2: Run prompt #1 (cache creation)
  let sessionId: string | undefined;
  try {
    const result1 = await runPrompt(TEST_PROMPT, undefined, 'Run 1 (cache creation)');
    sessionId = result1.sessionId;
  } catch (err) {
    console.error(`Run 1 failed: ${err}`);
    process.exit(1);
  }

  // Small delay to ensure metrics are flushed
  await new Promise((r) => setTimeout(r, 2_000));

  // Step 3: Run prompt #2 (cache hit expected)
  try {
    await runPrompt(TEST_PROMPT, sessionId, 'Run 2 (cache read)');
  } catch (err) {
    console.error(`Run 2 failed: ${err}`);
    process.exit(1);
  }

  await new Promise((r) => setTimeout(r, 2_000));

  // Step 4: Read metrics
  const metrics = readMetrics().slice(metricsBefore);
  console.log(`\n${'='.repeat(50)}`);
  console.log('RESULTS');
  console.log('='.repeat(50));

  if (metrics.length < 2) {
    console.error(
      `\nFAIL: Expected 2 cache metric entries, found ${metrics.length}.`,
    );
    console.error(
      'The agent runner may not be producing cache-metrics.jsonl.',
    );
    if (metrics.length > 0) {
      console.log('\nAvailable metrics:');
      for (const m of metrics) {
        console.log(`  ${JSON.stringify(m)}`);
      }
    }
    process.exit(1);
  }

  const run1 = metrics[0];
  const run2 = metrics[1];

  console.log('\nRun 1 (cache creation):');
  console.log(`  Input tokens:          ${run1.inputTokens}`);
  console.log(`  Cache creation tokens: ${run1.cacheCreationInputTokens}`);
  console.log(`  Cache read tokens:     ${run1.cacheReadInputTokens}`);
  console.log(`  Cost:                  $${run1.costUSD.toFixed(4)}`);

  console.log('\nRun 2 (cache read):');
  console.log(`  Input tokens:          ${run2.inputTokens}`);
  console.log(`  Cache creation tokens: ${run2.cacheCreationInputTokens}`);
  console.log(`  Cache read tokens:     ${run2.cacheReadInputTokens}`);
  console.log(`  Cost:                  $${run2.costUSD.toFixed(4)}`);

  // Step 5: Calculate cache hit rate for run 2
  const run2TotalInput =
    run2.inputTokens + run2.cacheReadInputTokens + run2.cacheCreationInputTokens;
  const run2CacheHitRate =
    run2TotalInput > 0 ? run2.cacheReadInputTokens / run2TotalInput : 0;

  // Cost reduction
  const costReduction =
    run1.costUSD > 0 ? 1 - run2.costUSD / run1.costUSD : 0;

  console.log('\nAnalysis:');
  console.log(`  Run 2 cache hit rate:  ${(run2CacheHitRate * 100).toFixed(1)}%`);
  console.log(`  Cost reduction:        ${(costReduction * 100).toFixed(1)}%`);

  // Step 6: Pass/fail
  console.log(`\n${'='.repeat(50)}`);
  if (run2CacheHitRate >= ACCEPTANCE_THRESHOLD) {
    console.log(
      `PASS: Cache hit rate ${(run2CacheHitRate * 100).toFixed(1)}% >= ${ACCEPTANCE_THRESHOLD * 100}% threshold`,
    );
    process.exit(0);
  } else {
    console.log(
      `FAIL: Cache hit rate ${(run2CacheHitRate * 100).toFixed(1)}% < ${ACCEPTANCE_THRESHOLD * 100}% threshold`,
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`Test failed: ${err}`);
  process.exit(1);
});
