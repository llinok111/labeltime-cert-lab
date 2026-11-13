// core.mjs — continuous-time label clearance certificate + minimal repair.
//
// Pure ES module: NO three.js, NO DOM, NO window/document/navigator, NO file I/O,
// NO network, NO env reads at module top-level. Runnable with plain `node`.

// Labels travel along a straight trajectory in screen/model space: the running
// geometry is a *continuous* rectangle, axis-aligned, that slides linearly from
// anchor at t=0 to anchor at t=1. We compute the *exact, closed-form* time
// interval [lo,hi] on which two such moving rectangles overlap — a continuous
// certificate that does NOT rely on dense time sampling.
//
// Per-axis overlap condition: the two centers are within `(hx_i+hx_j)` on x and
// `(hy_i+hy_j)` on y. Center differences are *linear in t*, so each axis gives a
// linear inequality `|d0 + d1 t| <= S` whose solution is a single closed interval.
// The pair overlaps where BOTH axes hold, i.e. the intersection of the two
// interval solutions (still a single closed interval).
//
// Scale invariance (11-02 ruling): all tolerances are RELATIVE to the scene's
// bounding-box diagonal, so cert/repair decisions are unchanged when the scene
// is uniformly scaled across many decades.

// ---- scene helpers ----------------------------------------------------------

// Scene: { labels: [ {x0,y0,x1,y1,hx,hy} ] }
// label travels center(t) = lerp((x0,y0),(x1,y1), t), t in [0,1].
// (hx,hy) are the *half* extents of the axis-aligned rect centered on the anchor.

// Relative epsilon (unitless); scale this by the scene diagonal.
export const REL_EPS = 1e-9;

// Bounding-box diagonal of a scene (covers both endpoints of every trajectory).
export function sceneDiag(scene) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const L of scene.labels) {
    for (const [x, y] of [[L.x0, L.y0], [L.x1, L.y1]]) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return Math.hypot(maxX - minX, maxY - minY) || 1;
}

export function centersAt(scene, t) {
  const out = new Array(scene.labels.length);
  for (let i = 0; i < scene.labels.length; i++) {
    const L = scene.labels[i];
    out[i] = { x: L.x0 + (L.x1 - L.x0) * t, y: L.y0 + (L.y1 - L.y0) * t };
  }
  return out;
}

// overlap indicator between labels i,j at parameter t (1 overlap, 0 clear).
export function overlapAt(scene, i, j, t) {
  const Ci = centersAt(scene, t)[i];
  const Cj = centersAt(scene, t)[j];
  const L = scene.labels;
  const hx = L[i].hx + L[j].hx;
  const hy = L[i].hy + L[j].hy;
  const dx = Math.abs(Ci.x - Cj.x);
  const dy = Math.abs(Ci.y - Cj.y);
  // strict: exact tangency is measure-zero, NOT a violation. This predicate is
  // deliberately EPS-free so it agrees bit-for-bit with the closed-form interval
  // (an eps band here made analytic and sampling disagree by O(1) in time).
  return dx < hx && dy < hy ? 1 : 0;
}

// ---- closed-form continuous interval ----------------------------------------

// Interval of t in [0,1] on which |d0 + d1*t| <= S. Returns {lo,hi} or null.
// eps is an absolute-length tolerance (already scaled by the scene diagonal).
export function linAbsInterval(d0, d1, S) {
  if (S <= 0) return null;
  if (d1 === 0) return Math.abs(d0) < S ? { lo: 0, hi: 1 } : null;
  const r1 = (-S - d0) / d1;
  const r2 = (S - d0) / d1;
  const a = Math.min(r1, r2), b = Math.max(r1, r2);
  const lo = Math.max(0, a);
  const hi = Math.min(1, b);
  // strict interval: hi > lo required; an exact tangency (hi === lo) is null.
  if (hi > lo) return { lo, hi };
  return null;
}

function clipInt(I) {
  if (!I) return null;
  const lo = Math.max(0, Math.min(1, I.lo));
  const hi = Math.max(0, Math.min(1, I.hi));
  return hi > lo ? { lo, hi } : null;
}

// Exact continuous overlap interval [lo,hi] for a single pair, or null when the
// two moving rects never overlap over t in [0,1].
export function pairOverlapInterval(scene, i, j) {
  const Li = scene.labels[i], Lj = scene.labels[j];
  const dx0 = Li.x0 - Lj.x0, dx1 = (Li.x1 - Li.x0) - (Lj.x1 - Lj.x0);
  const dy0 = Li.y0 - Lj.y0, dy1 = (Li.y1 - Li.y0) - (Lj.y1 - Lj.y0);
  const Sx = Li.hx + Lj.hx;
  const Sy = Li.hy + Lj.hy;
  const X = linAbsInterval(dx0, dx1, Sx);
  const Y = linAbsInterval(dy0, dy1, Sy);
  if (!X || !Y) return null;
  const lo = Math.max(X.lo, Y.lo);
  const hi = Math.min(X.hi, Y.hi);
  return clipInt({ lo, hi });
}

// ---- continuous certificate: full clearance profile ---------------------------

// Returns { pairs:[{i,j,lo,hi,measure}], totalMeasure }.
// totalMeasure = sum of (hi-lo) over all overlapping pairs = exact continuous
// time measure (in units of t) on which at least one pair collides.
export function clearanceProfile(scene, eps) {
  const e = eps == null ? REL_EPS * sceneDiag(scene) : eps;
  const pairs = [];
  let totalMeasure = 0;
  for (let i = 0; i < scene.labels.length; i++) {
    for (let j = i + 1; j < scene.labels.length; j++) {
      const I = pairOverlapInterval(scene, i, j, e);
      if (I) {
        const measure = I.hi - I.lo;
        pairs.push({ i, j, lo: I.lo, hi: I.hi, measure });
        totalMeasure += measure;
      }
    }
  }
  // time measure is dimensionless (fraction of t in [0,1]); a conflict is real
  // whenever any positive-length interval collides. Threshold is a tiny TIME
  // tolerance, deliberately independent of the (spatial) scene scale.
  const TIME_EPS = 1e-12;
  const conflict = totalMeasure > TIME_EPS;
  return { pairs, totalMeasure, conflict };
}

// ---- minimal repair -----------------------------------------------------------

// Repair objective: remove all continuous-time overlap while perturbing the
// layout as little as possible. We use a **monotone upward vertical stack**:
// for every colliding pair, push the higher-indexed label strictly upward (+y)
// by just enough that its y-center sweep lies entirely above the other label's
// sweep over the pair's overlap interval. Because pushes only ever INCREASE y
// (never decrease) each label moves monotonically, so the resolution cannot
// oscillate: if pushing j up collides it with a higher label k, that only makes
// the process push k up too, and every step strictly increases total y-extent of
// the moved label — the cascade terminates after finitely many pushes. This
// genuinely clears collinear catch-ups that radial expansion cannot.
//
// It is NOT label-optimal in general (stacking may over-separate when an axis
// with more room exists), which the README discloses honestly. The proven claim
// is: a finite monotone +y repair exists that drives continuous overlap to 0.
export function minRepair(scene) {
  const labels = scene.labels.map((L) => ({ ...L }));
  const work = { labels };
  const moved = new Array(labels.length).fill(null);
  const addMove = (k, dx, dy) => {
    if (dx || dy) {
      moved[k] = moved[k] || { dx: 0, dy: 0 };
      moved[k].dx += dx; moved[k].dy += dy;
    }
  };

  let profile = clearanceProfile(work);
  let sweeps = 0;
  const MAX_SWEEPS = 400;
  while (profile.conflict && sweeps < MAX_SWEEPS) {
    // recompute relative epsilon from the CURRENT scene extents (the scene grows
    // as we push, so a stale eps is how the old version self-reported a false 0)
    const e = REL_EPS * sceneDiag(work);
    let anyChange = false;
    for (const p of profile.pairs) {
      const I = pairOverlapInterval(work, p.i, p.j);
      if (!I) continue;
      const Li = work.labels[p.i], Lj = work.labels[p.j];
      const Sy = Li.hy + Lj.hy;
      // y-center separation over [lo,hi]
      const vy = (Lj.y1 - Lj.y0) - (Li.y1 - Li.y0);
      const baseY = Lj.y0 - Li.y0;
      const ya = baseY + vy * I.lo, yb = baseY + vy * I.hi;
      const DminY = Math.min(ya, yb);
      // push label j up so min separation clears Sy (only upward, monotone)
      if (DminY < Sy + e) {
        const push = Sy + 2 * e - DminY;
        work.labels[p.j].y0 += push;
        work.labels[p.j].y1 += push;
        addMove(p.j, 0, push);
        anyChange = true;
      }
    }
    if (!anyChange) break; // no progress possible with only-up moves
    profile = clearanceProfile(work);
    sweeps++;
  }
  // final FRESH re-certification (must use the final scene, not a stale eps)
  const finalProfile = clearanceProfile(work);

  const displacement = moved.reduce((s, m) => s + (m ? Math.hypot(m.dx, m.dy) : 0), 0);
  return {
    scene: work,
    resolved: !finalProfile.conflict,
    sweeps,
    totalMeasureAfter: finalProfile.totalMeasure,
    moved,
    displacement,
  };
}