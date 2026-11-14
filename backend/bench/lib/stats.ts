// SHARED (Phase 0a). Small statistics helpers.

/** Nearest-rank percentile (p in 0..100). */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1];
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function summarize(values: number[]) {
  if (values.length === 0) return { n: 0, min: NaN, max: NaN, mean: NaN, p50: NaN, p95: NaN };
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    n: values.length,
    min: r1(Math.min(...values)),
    max: r1(Math.max(...values)),
    mean: r1(sum / values.length),
    p50: r1(percentile(values, 50)),
    p95: r1(percentile(values, 95)),
  };
}

/** Deterministic random numbers in [0, 1) (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
