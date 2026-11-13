// oracle.mjs — INDEPENDENT dense-time oracle for continuous overlap.
//
// Deliberately separate from core.mjs: it re-derives overlap by dense uniform
// sampling of t (N samples) rather than by closed-form interval arithmetic, so a
// bug in the analytic core is caught by the sampler and vice versa. It imports
// nothing from core.mjs — it re-implements the tiny overlap predicate itself, so
// the two implementations share no constants (no common-EPS confound, per 11-02
// ruling).

// Sample-based overlap fraction for a pair over t in [0,1].
export function sampledOverlapFraction(scene, i, j, n = 10000) {
  const Li = scene.labels[i], Lj = scene.labels[j];
  const hx = Li.hx + Lj.hx;
  const hy = Li.hy + Lj.hy;
  let hits = 0;
  for (let s = 0; s < n; s++) {
    const t = s / (n - 1);
    const cxi = Li.x0 + (Li.x1 - Li.x0) * t;
    const cyi = Li.y0 + (Li.y1 - Li.y0) * t;
    const cxj = Lj.x0 + (Lj.x1 - Lj.x0) * t;
    const cyj = Lj.y0 + (Lj.y1 - Lj.y0) * t;
    if (Math.abs(cxi - cxj) < hx && Math.abs(cyi - cyj) < hy) hits++;
  }
  return hits / n;
}

// Independent check: is pair overlap conftinuous interval [lo,hi] nonempty?
// Returns first t where the pair overlaps, or null.
export function firstSampledOverlap(scene, i, j, n = 100000) {
  const Li = scene.labels[i], Lj = scene.labels[j];
  const hx = Li.hx + Lj.hx, hy = Li.hy + Lj.hy;
  for (let s = 0; s < n; s++) {
    const t = s / (n - 1);
    const cxi = Li.x0 + (Li.x1 - Li.x0) * t;
    const cyi = Li.y0 + (Li.y1 - Li.y0) * t;
    const cxj = Lj.x0 + (Lj.x1 - Lj.x0) * t;
    const cyj = Lj.y0 + (Lj.y1 - Lj.y0) * t;
    if (Math.abs(cxi - cxj) < hx && Math.abs(cyi - cyj) < hy) return t;
  }
  return null;
}