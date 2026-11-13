// tools/gen-sample.mjs — deterministic construction of animated-label scenes.
//
// Fixed-seed PRNG (mulberry32) so the same command reproduces byte-identical
// scenes every time (per run the `md5` of the output is printed). Outputs one
// JSON file per scene under data/.
//
// Scene JSON: { name, diag, labels:[{x0,y0,x1,y1,hx,hy}] }
// label travels center(t)=lerp((x0,y0),(x1,y1),t), t in [0,1].

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import crypto from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', 'data');
mkdirSync(dataDir, { recursive: true });

// mulberry32 seeded PRNG
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- scene constructors ------------------------------------------------------

function sceneCrossing(seed, labelSize) {
  // pairs of labels on crossing trajectories through a shared region
  const r = rng(seed);
  const labels = [];
  const nPairs = 6;
  for (let p = 0; p < nPairs; p++) {
    // horizontal mover through the middle
    const y = (r() - 0.5) * 1.6;
    labels.push({ x0: -4, y0: y, x1: 4, y1: y, hx: labelSize, hy: labelSize * 0.5 });
    // vertical mover crossing it
    const x = (r() - 0.5) * 1.6;
    labels.push({ x0: x, y0: -4, x1: x, y1: 4, hx: labelSize, hy: labelSize * 0.5 });
  }
  return labels;
}

function sceneChase(seed, labelSize) {
  // two groups moving along parallel tracks with different speeds => catch-ups
  const r = rng(seed);
  const labels = [];
  const tracks = 4;
  for (let t = 0; t < tracks; t++) {
    const ty = t * 0.8 - 1.2;
    // slow + fast on the same track -> the fast one catches the slow one
    const ms = r() * 1.5 + 0.5;
    const mf = ms + r() * 2.0 + 0.6;
    const slowStart = -3 + (r() - 0.5) * 1.0;
    labels.push({ x0: slowStart, y0: ty, x1: slowStart + ms, y1: ty, hx: labelSize, hy: labelSize * 0.5 });
    const fastStart = -3 + (r() - 0.5) * 1.0;
    labels.push({ x0: fastStart, y0: ty, x1: fastStart + mf, y1: ty, hx: labelSize, hy: labelSize * 0.5 });
  }
  return labels;
}

function sceneGridShift(seed, labelSize) {
  // a grid that shifts diagonally; neighboring cells slide over each other when
  // the shift magnitude exceeds the inter-cell spacing
  const r = rng(seed);
  const labels = [];
  const side = 3;
  const spacing = 0.9;
  const shiftX = 0.5;
  const shiftY = 0.5;
  for (let gy = 0; gy < side; gy++) {
    for (let gx = 0; gx < side; gx++) {
      labels.push({
        x0: gx * spacing - 1, y0: gy * spacing - 1,
        x1: gx * spacing - 1 + shiftX + (r() - 0.5) * 0.2,
        y1: gy * spacing - 1 + shiftY + (r() - 0.5) * 0.2,
        hx: labelSize, hy: labelSize * 0.5,
      });
    }
  }
  return labels;
}

const BUILDERS = [
  ['scene-a-crossing', sceneCrossing],
  ['scene-b-chase', sceneChase],
  ['scene-c-gridshift', sceneGridShift],
];

function buildScene(name, labels) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const L of labels) {
    for (const [x, y] of [[L.x0, L.y0], [L.x1, L.y1]]) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  return { name, diag: Math.hypot(maxX - minX, maxY - minY) || 1, labels };
}

const SEED = 20261114;
// label size picked large enough to force collisions in the base unit scale
const labelSize = 0.45;

const scenes = BUILDERS.map(([name, fn]) =>
  buildScene(name, fn(SEED, labelSize)));

for (const s of scenes) {
  const json = JSON.stringify(s, null, 2) + '\n';
  writeFileSync(join(dataDir, s.name + '.json'), json);
}

// byte-identity check helper text
for (const s of scenes) {
  const buf = JSON.stringify(s, null, 2) + '\n';
  const hash = crypto.createHash('md5').update(buf).digest('hex');
  console.log(`generated data/${s.name}.json  md5=${hash}  labels=${s.labels.length}`);
}
console.log(`seed=${SEED}  deterministic-reseed-ok`);