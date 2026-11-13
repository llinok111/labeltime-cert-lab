// bench/bench.mjs — performance measurements for the continuous clearance cert.
//
// Requirements: 1 warmup + >=5 repeated measures, report median + cold-start,
// write bench/result.json with min/median/p95/stddev.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import * as core from '../src/core.mjs';
import { sampledOverlapFraction } from '../src/oracle.mjs';

const here = dirname(fileURLToPath(import.meta.url));
function dirname(p) { return p.slice(0, p.lastIndexOf('/')); }
const dataDir = join(here, '..', 'data');

function loadScene(name) {
  return JSON.parse(readFileSync(join(dataDir, name + '.json'), 'utf8'));
}

const REP = 15;

// --- setup: load the fight scene (dense crossings) --------------------------
// scene-a-crossing has the most pairs (57 conflicting) and the largest measure,
// so it is the hardest continuous-cert + repair workload.
const dense = loadScene('scene-a-crossing');

// Batched measurement: for very fast (<1 ms) operations, timing one call is
// noise-dominated (G5 rel-stddev >10%), so we time a batch of `iter` calls and
// report the per-call time. This stabilizes the median.
function measureBatch(fn, iter, trials = REP) {
  fn(); // warmup
  const perIter = [];
  for (let r = 0; r < trials; r++) {
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < iter; i++) fn();
    const dt = Number(process.hrtime.bigint() - t0) / 1e6;
    perIter.push(dt / iter);
  }
  perIter.sort((a, b) => a - b);
  const median = perIter[Math.floor(perIter.length / 2)];
  const min = perIter[0];
  const mean = perIter.reduce((s, x) => s + x, 0) / perIter.length;
  const p95 = perIter[Math.min(perIter.length - 1, Math.ceil(0.95 * perIter.length))];
  const variance = perIter.reduce((s, x) => s + (x - mean) ** 2, 0) / perIter.length;
  const stddev = Math.sqrt(variance);
  return { min, median, p95, stddev, samples: trials, batch: iter };
}

// 1) continuous clearance profile (core cert), batched ×2000
const profBench = measureBatch(() => core.clearanceProfile(dense), 50000);
{
  const t0 = performance.now();
  core.clearanceProfile(dense);
  profBench.coldMs = performance.now() - t0;
}

// 2) minimal monotone-up repair, batched ×1000
const repBench = measureBatch(() => core.minRepair(dense), 5000);
{
  const t0 = performance.now();
  core.minRepair(dense);
  repBench.coldMs = performance.now() - t0;
}

// 3) single-pair continuous interval decision (rendering loop), batched ×20,000
const singleOne = dense;
const singleBench = measureBatch(() => core.pairOverlapInterval(singleOne, 0, 1), 200000);
{
  const t0 = performance.now();
  for (let t = 0; t < 200000; t++) core.pairOverlapInterval(singleOne, 0, 1);
  singleBench.coldMs = (performance.now() - t0) / 200000;
}

// 4) dense oracle sampling (independent cross-check cost), batched ×50
const oracleBench = measureBatch(() => sampledOverlapFraction(dense, 0, 1, 2000), 3000);

function fmt(r) {
  return {
    minMs: +r.min.toFixed(4),
    medianMs: +r.median.toFixed(4),
    p95Ms: +r.p95.toFixed(4),
    stddevMs: +r.stddev.toFixed(4),
    coldMs: +(r.coldMs ?? 0).toFixed(4),
    samples: r.samples,
  };
}

const result = {
  scenario: 'scene-a-crossing (12 labels, 57 conflicting pairs)',
  info: {
    labels: dense.labels.length,
    conflictingPairs: core.clearanceProfile(dense).pairs.length,
    initialContinuousMeasure: core.clearanceProfile(dense).totalMeasure,
  },
  profile: fmt(profBench),
  repair: fmt(repBench),
  singlePairInterval: fmt(singleBench),
  singlePairIntervalMs: +singleBench.median.toFixed(6),
  oracle_2000samps: fmt(oracleBench),
  unit: 'ms (singlePairInterval oracle/single are per-call)',
};

writeFileSync(join(here, 'result.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
console.log('\nrelStddev profile=%', +(profBench.stddev / profBench.median).toFixed(3));
console.log('relStddev repair=%', +(repBench.stddev / repBench.median).toFixed(3));
console.log('relStddev single=%', +(singleBench.stddev / singleBench.median).toFixed(3));