// Demand rendering leaves long gaps while idle. Only continuous, foreground
// frames belong in the adaptive quality sample.
export const THEATER_QUALITY = Object.freeze({
  low: Object.freeze({ dpr: 1, shadows: false, shadowSize: 512, antialias: false }),
  auto: Object.freeze({ dpr: 1.35, shadows: true, shadowSize: 512, antialias: true }),
  high: Object.freeze({ dpr: 1.75, shadows: true, shadowSize: 1024, antialias: true }),
});
const AUTO_TIERS = [THEATER_QUALITY.low, THEATER_QUALITY.auto, { ...THEATER_QUALITY.high, dpr: 1.5, shadowSize: 512 }];

export function createQualitySampler() {
  return { tier: 1, averageMs: 0, samples: 0, elapsed: 0, slowFor: 0, fastFor: 0, cooldown: 0 };
}

/** Mutates only its local sampler, never renderer, settings or gameplay state. */
export function sampleTheaterQuality(state, delta, active = true) {
  if (!active || !Number.isFinite(delta) || delta <= 0 || delta > .12) {
    state.slowFor = 0; state.fastFor = 0;
    return false;
  }
  const ms = delta * 1000;
  const weight = 1 - Math.exp(-delta * 2);
  state.averageMs = state.samples ? state.averageMs + (ms - state.averageMs) * weight : ms;
  state.samples++;
  state.elapsed += delta;
  state.cooldown = Math.max(0, state.cooldown - delta);
  const slow = state.averageMs > (state.tier === 2 ? 23 : 28);
  const fast = state.averageMs < 18;
  state.slowFor = slow ? state.slowFor + delta : 0;
  state.fastFor = fast ? state.fastFor + delta : 0;
  if (state.samples < 60 || state.elapsed < 2 || state.cooldown > 0) return false;
  const next = state.slowFor >= 3 ? Math.max(0, state.tier - 1) : state.fastFor >= 6 ? Math.min(2, state.tier + 1) : state.tier;
  if (next === state.tier) return false;
  state.tier = next; state.cooldown = 8; state.slowFor = 0; state.fastFor = 0;
  return true;
}

export function theaterQualitySettings(mode, sampler) {
  return mode === 'low' || mode === 'high' ? THEATER_QUALITY[mode] : AUTO_TIERS[sampler?.tier ?? 1];
}

export function theaterPerformanceSnapshot(state) {
  return { samples: state.samples, sampledSeconds: Number(state.elapsed.toFixed(2)), frameMs: Number(state.averageMs.toFixed(2)), estimatedFps: state.averageMs > 0 ? Number((1000 / state.averageMs).toFixed(1)) : null, tier: state.tier };
}
