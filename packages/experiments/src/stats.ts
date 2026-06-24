/** Standard normal CDF via an Abramowitz-Stegun erf approximation. */
function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-x * x);
  return x >= 0 ? y : -y;
}

const phi = (x: number): number => 0.5 * (1 + erf(x / Math.SQRT2));

/**
 * Two-proportion z-test. Returns the two-sided p-value for H0: the two
 * conversion rates are equal.
 */
export function twoProportionPValue(
  convA: number,
  nA: number,
  convB: number,
  nB: number,
): number {
  if (nA === 0 || nB === 0) return 1;
  const pA = convA / nA;
  const pB = convB / nB;
  const pooled = (convA + convB) / (nA + nB);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / nA + 1 / nB));
  if (se === 0) return 1;
  const z = (pB - pA) / se;
  return 2 * (1 - phi(Math.abs(z)));
}

/**
 * Sample-ratio-mismatch p-value (chi-square goodness of fit, 1 dof for a two-arm
 * test). Low p means the observed split deviates from the intended split more than
 * chance allows — assignment is broken and results can't be trusted.
 */
export function srmPValue(observed: number[], expectedWeights: number[]): number {
  const totalObs = observed.reduce((a, b) => a + b, 0);
  const totalW = expectedWeights.reduce((a, b) => a + b, 0);
  if (totalObs === 0 || totalW === 0) return 1;
  let chi2 = 0;
  for (let i = 0; i < observed.length; i++) {
    const expected = (expectedWeights[i] / totalW) * totalObs;
    if (expected > 0) chi2 += (observed[i] - expected) ** 2 / expected;
  }
  // Survival of chi-square with 1 dof: 2*(1 - Phi(sqrt(chi2))).
  return Math.max(0, Math.min(1, 2 * (1 - phi(Math.sqrt(chi2)))));
}
