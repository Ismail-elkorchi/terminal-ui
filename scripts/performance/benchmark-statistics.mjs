export function summarizeSamples(samples) {
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new TypeError('Benchmark samples must be a non-empty array.');
  }
  if (samples.some((sample) => !Number.isFinite(sample) || sample < 0)) {
    throw new TypeError('Benchmark samples must be finite non-negative numbers.');
  }
  const sorted = samples.toSorted((left, right) => left - right);
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const variance = samples.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / samples.length;
  const p50 = percentile(sorted, 0.5);
  const deviations = samples.map((value) => Math.abs(value - p50)).toSorted((left, right) => left - right);
  return Object.freeze({
    count: samples.length,
    p50Ms: rounded(p50),
    p95Ms: rounded(percentile(sorted, 0.95)),
    meanMs: rounded(mean),
    standardDeviationMs: rounded(Math.sqrt(variance)),
    medianAbsoluteDeviationMs: rounded(percentile(deviations, 0.5)),
    coefficientOfVariation: rounded(mean === 0 ? 0 : Math.sqrt(variance) / mean)
  });
}

function percentile(sorted, fraction) {
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const lowerValue = sorted[lower] ?? 0;
  const upperValue = sorted[upper] ?? lowerValue;
  return lowerValue + ((upperValue - lowerValue) * (position - lower));
}

function rounded(value) {
  return Number(value.toFixed(4));
}
