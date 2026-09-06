export type ConfidenceInputs = {
  freshness: number;
  sourceAgreement: number;
  physicalCoverage: number;
  forecastStability: number;
  disruptionRisk: number;
};

export type ConfidenceResult = {
  score: number;
  band: 'LOW' | 'MEDIUM' | 'HIGH';
  components: Record<string, number>;
};

const clamp = (value: number) => Math.max(0, Math.min(100, value));

/**
 * Explainable 0-100 confidence score for future use once every input is
 * evidence-backed. This module does not provide source values itself.
 *
 * Positive evidence dimensions are weighted by their usefulness to a physical
 * oil-market decision. Disruption risk is inverted so high unresolved risk
 * reduces confidence. The output is deterministic and auditable; it is not a
 * probability.
 */
export function calculateConfidence(input: ConfidenceInputs): ConfidenceResult {
  const components = {
    freshness: clamp(input.freshness),
    sourceAgreement: clamp(input.sourceAgreement),
    physicalCoverage: clamp(input.physicalCoverage),
    forecastStability: clamp(input.forecastStability),
    riskResolution: 100 - clamp(input.disruptionRisk),
  };

  const score = Math.round(
    components.freshness * 0.22 +
      components.sourceAgreement * 0.25 +
      components.physicalCoverage * 0.23 +
      components.forecastStability * 0.2 +
      components.riskResolution * 0.1,
  );

  return {
    score,
    band: score >= 80 ? 'HIGH' : score >= 60 ? 'MEDIUM' : 'LOW',
    components,
  };
}

export type BalanceScenario = {
  supplyMbpd: number;
  demandMbpd: number;
  balanceMbpd: number;
  state: 'SURPLUS' | 'BALANCED' | 'DEFICIT';
};

export function assessBalance(supplyMbpd: number, demandMbpd: number): BalanceScenario {
  const balanceMbpd = Number((supplyMbpd - demandMbpd).toFixed(2));
  return {
    supplyMbpd,
    demandMbpd,
    balanceMbpd,
    state: balanceMbpd > 0.25 ? 'SURPLUS' : balanceMbpd < -0.25 ? 'DEFICIT' : 'BALANCED',
  };
}
