// main.js — render layer for clearance-cert-lab.
//
// Consumes src/core.mjs: the continuous overlap intervals reported by the core
// drive both the timeline and the "conflict at now" indicator. No geometry
// predicate is recomputed here — we only test whether the current t falls
// inside a certified interval.

import * as THREE from 'three';
import * as core from './src/core.mjs';

const HUD = document.getElementById('stats');
const timelineEl = document.getElementById('timeline');
const tRange = document.getElementById('tRange');
const playBtn = document.getElementById('playBtn');
const repairBtn = document.getElementById('repairBtn');
const resetBtn = document.getElementById('resetBtn');

let scene = null;
let original = null;
let profile = null;
let repairResult = null;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
renderer.domElement.style.position = 'fixed';
renderer.domElement.style.inset = '0';
renderer.domElement.style.zIndex = '1';

const threeScene = new THREE.Scene();
threeScene.background = new THREE.Color(0x0b0f14);

// world extents (keep the sample scenes in view)
let worldHalf = 6;
const camera = new THREE.OrthographicCamera(-worldHalf, worldHalf, worldHalf, -worldHalf, 0.1, 100);
camera.position.set(0, 0, 10);
camera.lookAt(0, 0, 0);

// one instanced-style group of plane meshes for labels
const labelGroup = new THREE.Group();
threeScene.add(labelGroup);
const labelMeshes = [];

const HIT = new THREE.Color(0xff5d5d);
const OK = new THREE.Color(0x3fb950);

function buildLabelMeshes() {
  while (labelMeshes.length) {
    const m = labelMeshes.pop();
    labelGroup.remove(m);
    m.geometry.dispose(); m.material.dispose();
  }
  for (let i = 0; i < scene.labels.length; i++) {
    const L = scene.labels[i];
    const geo = new THREE.PlaneGeometry(L.hx * 2, L.hy * 2);
    const mat = new THREE.MeshBasicMaterial({ color: OK, transparent: true, opacity: 0.34, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    const edge = new THREE.EdgesGeometry(geo);
    mesh.add(new THREE.LineSegments(edge, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 })));
    labelGroup.add(mesh);
    labelMeshes.push(mesh);
  }
}

function updatePositions(t) {
  const centers = core.centersAt(scene, t);
  for (let i = 0; i < labelMeshes.length; i++) {
    labelMeshes[i].position.set(centers[i].x, centers[i].y, 0);
  }
}

// certified conflict at time t: is t inside any core-reported interval?
function conflictAtNow(t) {
  for (const p of profile.pairs) {
    if (t >= p.lo - 1e-12 && t <= p.hi + 1e-12) return true;
  }
  return false;
}

function paintTimeline(prof) {
  timelineEl.innerHTML = '';
  const NSEG = 120;
  for (let s = 0; s < NSEG; s++) {
    const ta = s / NSEG, tb = (s + 1) / NSEG;
    const tm = (ta + tb) / 2;
    let hit = false;
    for (const p of prof.pairs) if (tm >= p.lo && tm <= p.hi) { hit = true; break; }
    const d = document.createElement('div');
    d.className = 'seg ' + (hit ? 'bad' : 'ok');
    d.style.width = (100 / NSEG) + '%';
    timelineEl.appendChild(d);
  }
}

function updateHud(t) {
  const hits = conflictAtNow(t);
  const rows = [
    `labels: <span class="num">${scene.labels.length}</span> · conflicting pairs: <span class="num">${profile.pairs.length}</span>`,
    `continuous overlap measure (t): <span class="${profile.conflict ? 'bad' : 'num'}">${profile.totalMeasure.toFixed(4)}</span>`,
    `now t=${t.toFixed(3)} → <span class="${hits ? 'bad' : 'num'}">${hits ? 'CONFLICT' : 'clear'}</span>`,
  ];
  if (repairResult) {
    rows.push(`after repair: resolved=<span class="${repairResult.resolved ? 'num' : 'bad'}">${repairResult.resolved}</span>, ` +
      `displacement=<span class="num">${repairResult.displacement.toFixed(3)}</span>, ` +
      `sweeps=<span class="num">${repairResult.sweeps}</span>`);
  }
  HUD.innerHTML = rows.join('<br/>');
}

// --- animation ----------------------------------------------------------------
let playing = true;
let t = 0;
let last = performance.now();

function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (playing) {
    t += dt * 0.28;
    if (t > 1) t -= 1;
    tRange.value = String(Math.round(t * 1000));
  }
  updatePositions(t);
  const hits = conflictAtNow(t);
  for (const m of labelMeshes) m.material.color.copy(hits ? HIT : OK);
  updateHud(t);
  renderer.render(threeScene, camera);
  requestAnimationFrame(tick);
}

// --- controls -----------------------------------------------------------------
tRange.addEventListener('input', () => {
  playing = false;
  playBtn.textContent = 'Play';
  t = Number(tRange.value) / 1000;
  updatePositions(t);
  const hits = conflictAtNow(t);
  for (const m of labelMeshes) m.material.color.copy(hits ? HIT : OK);
  updateHud(t);
});

playBtn.addEventListener('click', () => {
  playing = !playing;
  playBtn.textContent = playing ? 'Pause' : 'Play';
  last = performance.now();
});

repairBtn.addEventListener('click', () => {
  if (!repairResult) {
    repairResult = core.minRepair(original);
  }
  scene = repairResult.scene;
  profile = core.clearanceProfile(scene);
  paintTimeline(profile);
  buildLabelMeshes();
  updatePositions(t);
  updateHud(t);
});

resetBtn.addEventListener('click', () => {
  scene = original;
  repairResult = null;
  profile = core.clearanceProfile(scene);
  paintTimeline(profile);
  buildLabelMeshes();
  updatePositions(t);
  updateHud(t);
});

window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.left = -worldHalf * (w / h); camera.right = worldHalf * (w / h);
  camera.top = worldHalf; camera.bottom = -worldHalf;
  camera.updateProjectionMatrix();
});

// --- boot ---------------------------------------------------------------------
async function boot() {
  const res = await fetch('./data/scene-a-crossing.json');
  original = await res.json();
  scene = original;
  profile = core.clearanceProfile(scene);

  // fit camera to scene extents
  let maxAbs = 1;
  for (const L of scene.labels) maxAbs = Math.max(maxAbs, Math.abs(L.x0), Math.abs(L.x1), Math.abs(L.y0), Math.abs(L.y1));
  worldHalf = maxAbs + 2;
  const w = window.innerWidth, h = window.innerHeight;
  camera.left = -worldHalf * (w / h); camera.right = worldHalf * (w / h);
  camera.top = worldHalf; camera.bottom = -worldHalf;
  camera.updateProjectionMatrix();

  buildLabelMeshes();
  paintTimeline(profile);
  updatePositions(0);
  updateHud(0);
  requestAnimationFrame(tick);
}

boot();