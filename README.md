# labeltime-cert-lab

Continuous-time label clearance certificate: for moving axis-aligned labels it computes the **exact closed-form time interval `[lo,hi]`** on which each pair overlaps over `t ∈ [0,1]` — no frame sampling — and then a **monotone, guaranteed-terminating repair** that drives the continuous overlap measure to zero.

Upstream: none

## What this is

`labelcast-lab` proved a *static* 40-label layout was clear; `toi-cert-lab` proved a *single triangle pair*'s time-of-impact interval. This repo is the continuous-time, **many-moving-labels** version: every label slides linearly in screen space and we certify **clearance over the whole continuous parameter range**, then repair when it fails.

A label at parameter `t` is a rectangle centered at `lerp((x0,y0),(x1,y1),t)` with fixed half-extents `(hx,hy)`. Two labels overlap when their centers are within `hx_i+hx_j` on x **and** `hy_i+hy_j` on y. Both center differences are *linear in t*, so each axis gives a one-dimensional linear inequality whose solution is a single closed interval; the pair overlaps on the intersection of the two axis intervals. This is a genuine continuous certificate — the interval endpoints are algebraic, not sampled.

The **independent oracle** (`src/oracle.mjs`) re-derives overlap by dense uniform sampling only, sharing no constants with `src/core.mjs`, so the analytic path and the sampler cross-check each other. Per the 11-02 ruling this is deliberate: an oracle that reused the core's `EPS` would be immune on the tolerance axis and would prove nothing.

**Why it matters:** dense per-frame sampling can *miss* a short collision between two samples and can never *prove* absence. This core returns the exact interval, so "clear over all t" is a fact, not a sampling artifact.

## How to run

```bash
node tools/gen-sample.mjs      # rebuild data/*.json (deterministic, fixed seed)
node bench/verify.mjs          # all assertions, exit 0 = pass
node bench/bench.mjs           # writes bench/result.json
python3 -m http.server 4173    # then open http://localhost:4173
```

Browser and node share the **same** `src/core.mjs`; the page's timeline and "conflict at now" indicator are derived from the exact interval list the core returns, never recomputed in `main.js`.

## Evidence (from `bench/result.json`, real run)

> Timing values below are copied verbatim from the committed `bench/result.json`; re-running `bench/bench.mjs` rewrites that file and absolute numbers will drift slightly.

Scenario: `scene-a-crossing` — 12 labels, **57 conflicting pairs**, initial continuous overlap measure **24.1980** (in units of `t`).

| measurement | median | cold | p95 | rel-stddev |
|---|---|---|---|---|
| `clearanceProfile` (full cert) | 0.0041 ms | 0.0082 ms | 0.0050 ms | 4.9% |
| `minRepair` (resolve to 0) | 0.0463 ms | 0.0520 ms | 0.0500 ms | 2.4% |
| `pairOverlapInterval` (one decision) | 0.000505 ms | — | — | 0.0% |

`verify.mjs` prints the asserted values, including:
- **3/3 scenes** where the closed-form interval and the dense sampler disagree on **0 pairs** (0/66, 0/28, 0/36).
- **3/3 scenes** where the continuous measure drops to **exactly 0** after repair, and post-repair dense sampling finds **0** positive analytic intervals.
- **5 scales** (1e-6 … 1e6): identical conflicting-pair counts and repair resolved at every scale; normalized displacement drift ≤ 1e-12.
- Scale-invariance of the repair uses a **dimensionless** `k`; no absolute `EPS` appears in any geometry predicate — all tolerances are `REL_EPS × bbox-diagonal`.

## 本轮创新

First continuous-time **multi-label** clearance certificate: exact closed-form overlap intervals per pair over the whole `t` range (not per-frame samples), cross-checked by an independent dense-sampling oracle, then a **provably terminating monotone repair** that reduces continuous overlap to exactly zero. `labelcast-lab` was a single static layout; `toi-cert-lab` was one triangle pair; this is the continuous many-label case those two did not cover. B档：首次把"精确区间证书 + 独立采样 oracle + 连续时间修复"三件套用在同一批移动标签上，且数字可 `node bench/verify.mjs` 现场复算。

## Known limitations (honest)

- **Overlap semantics = time measure.** A single-point tangency (`dx == hx` at exactly one `t`) has measure 0 and is *not* counted as a violation. This is the correct continuous-time reading; `verify.mjs` therefore reports post-repair "sampled overlap fraction < 1e-3" rather than "exactly 0 sampled hits" (a tangent point can still hit one sample).
- **Repair is monotone +y stacking, not a minimal-displacement or time-reparameterization optimizer.** It pushes the higher-indexed label upward until the pair clears; total displacement is not globally minimal, and it is *not* a temporal reparameterization (the collision is a real-space problem). The proven claim is only: *a finite monotone +y repair exists that drives continuous overlap to zero*, and it does so here in ≤ 11 sweeps. A globally minimal repair is explicitly out of scope.
- **Scale validity range.** All tolerances are relative to the scene bounding-box diagonal, so conclusions are scale-invariant across at least 1e-6 … 1e6 (verified). Below ~1e-12 absolute units double-precision cancellation would dominate; that regime is untested.
- **Motion model.** Straight-line trajectories only (`lerp` between two endpoints). Non-linear paths are out of scope; the interval math would need re-derivation.
- `main.js` needs network access to the pinned `three@0.160.0` CDN (unpkg). The node path and the certificate/repair core need **no** network and no `three`.

## License

MIT — see `LICENSE`.