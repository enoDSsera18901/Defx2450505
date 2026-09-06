export type EvidenceKind = 'observed' | 'estimate' | 'forecast' | 'scenario' | 'unavailable';

export type SourceReference = {
  provider: string;
  dataset: string;
  url?: string;
  observedAt?: string;
  retrievedAt: string;
};

export type EvidenceValue<T> = {
  kind: EvidenceKind;
  value: T | null;
  unit?: string;
  source?: SourceReference;
  method?: string;
  confidence?: number;
  reason?: string;
};

export type CargoState = 'loading' | 'laden' | 'discharging' | 'completed' | 'unknown';

export type CargoObservation = {
  vesselId: string;
  vesselName?: string;
  state: CargoState;
  grade: EvidenceValue<string>;
  origin: EvidenceValue<string>;
  destination: EvidenceValue<string>;
  volumeBbl: EvidenceValue<number>;
  eta: EvidenceValue<string>;
  position?: EvidenceValue<{ lat: number; lon: number }>;
};

export type LandedCostBreakdown = {
  crudeUsdBbl: EvidenceValue<number>;
  freightUsdBbl: EvidenceValue<number>;
  feesUsdBbl?: EvidenceValue<number>;
  totalUsdBbl: EvidenceValue<number>;
};

export type PhysicalMarketSnapshot = {
  generatedAt: string;
  globalSupplyMbpd: EvidenceValue<number>;
  globalDemandMbpd: EvidenceValue<number>;
  cargoes: CargoObservation[];
  landedCosts: LandedCostBreakdown[];
};

export function unavailableEvidence<T>(reason: string): EvidenceValue<T> {
  return {
    kind: 'unavailable',
    value: null,
    reason,
  };
}

export function validateEvidence<T>(record: EvidenceValue<T>): string[] {
  const errors: string[] = [];

  if (record.kind === 'unavailable') {
    if (record.value !== null) errors.push('Unavailable evidence must have a null value.');
    if (!record.reason?.trim()) errors.push('Unavailable evidence must explain why it is unavailable.');
    return errors;
  }

  if (record.value === null || record.value === undefined) {
    errors.push(`${record.kind} evidence must contain a value.`);
  }

  if (!record.source) {
    errors.push(`${record.kind} evidence must identify a source.`);
  }

  if ((record.kind === 'estimate' || record.kind === 'forecast' || record.kind === 'scenario') && !record.method?.trim()) {
    errors.push(`${record.kind} evidence must describe its method or assumptions.`);
  }

  if (record.confidence !== undefined && (record.confidence < 0 || record.confidence > 100)) {
    errors.push('Confidence must be between 0 and 100.');
  }

  return errors;
}

export function isDisplayableEvidence<T>(record: EvidenceValue<T>): boolean {
  return validateEvidence(record).length === 0;
}
