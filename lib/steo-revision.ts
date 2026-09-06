import { createHash } from 'node:crypto';

export type ComparableSteoPoint = {
  period: string;
  supplyMbpd: number;
  demandMbpd: number;
  balanceMbpd: number;
};

export type SteoRevisionChange = {
  period: string;
  previous: ComparableSteoPoint;
  current: ComparableSteoPoint;
  deltaSupplyMbpd: number;
  deltaDemandMbpd: number;
  deltaBalanceMbpd: number;
};

export type SteoRevisionComparison = {
  previousFingerprint: string;
  currentFingerprint: string;
  changed: boolean;
  addedPeriods: ComparableSteoPoint[];
  removedPeriods: ComparableSteoPoint[];
  revisedPeriods: SteoRevisionChange[];
  unchangedPeriods: number;
};

function validPeriod(period: string) {
  return /^\d{4}-\d{2}$/.test(period);
}

function finite(value: number) {
  return Number.isFinite(value);
}

function canonicalPoint(point: ComparableSteoPoint) {
  if (!validPeriod(point.period)) throw new Error(`Invalid STEO period: ${point.period}`);
  if (!finite(point.supplyMbpd) || !finite(point.demandMbpd) || !finite(point.balanceMbpd)) {
    throw new Error(`Invalid STEO numeric value for ${point.period}`);
  }

  return {
    period: point.period,
    supplyMbpd: point.supplyMbpd,
    demandMbpd: point.demandMbpd,
    balanceMbpd: point.balanceMbpd,
  };
}

function canonicalForecast(points: ComparableSteoPoint[]) {
  const seen = new Set<string>();
  return [...points]
    .map(canonicalPoint)
    .sort((a, b) => a.period.localeCompare(b.period))
    .map((point) => {
      if (seen.has(point.period)) throw new Error(`Duplicate STEO period: ${point.period}`);
      seen.add(point.period);
      return point;
    });
}

export function fingerprintSteoForecast(points: ComparableSteoPoint[]) {
  const canonical = canonicalForecast(points);
  if (!canonical.length) throw new Error('Cannot fingerprint an empty STEO forecast');
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function delta(current: number, previous: number) {
  return Number((current - previous).toFixed(4));
}

export function compareSteoForecasts(
  previous: ComparableSteoPoint[],
  current: ComparableSteoPoint[],
): SteoRevisionComparison {
  const previousCanonical = canonicalForecast(previous);
  const currentCanonical = canonicalForecast(current);
  if (!previousCanonical.length || !currentCanonical.length) {
    throw new Error('Both STEO forecasts must contain at least one period');
  }

  const previousByPeriod = new Map(previousCanonical.map((point) => [point.period, point]));
  const currentByPeriod = new Map(currentCanonical.map((point) => [point.period, point]));
  const addedPeriods: ComparableSteoPoint[] = [];
  const removedPeriods: ComparableSteoPoint[] = [];
  const revisedPeriods: SteoRevisionChange[] = [];
  let unchangedPeriods = 0;

  for (const point of currentCanonical) {
    const before = previousByPeriod.get(point.period);
    if (!before) {
      addedPeriods.push(point);
      continue;
    }

    if (
      before.supplyMbpd === point.supplyMbpd &&
      before.demandMbpd === point.demandMbpd &&
      before.balanceMbpd === point.balanceMbpd
    ) {
      unchangedPeriods += 1;
      continue;
    }

    revisedPeriods.push({
      period: point.period,
      previous: before,
      current: point,
      deltaSupplyMbpd: delta(point.supplyMbpd, before.supplyMbpd),
      deltaDemandMbpd: delta(point.demandMbpd, before.demandMbpd),
      deltaBalanceMbpd: delta(point.balanceMbpd, before.balanceMbpd),
    });
  }

  for (const point of previousCanonical) {
    if (!currentByPeriod.has(point.period)) removedPeriods.push(point);
  }

  const previousFingerprint = fingerprintSteoForecast(previousCanonical);
  const currentFingerprint = fingerprintSteoForecast(currentCanonical);

  return {
    previousFingerprint,
    currentFingerprint,
    changed: previousFingerprint !== currentFingerprint,
    addedPeriods,
    removedPeriods,
    revisedPeriods,
    unchangedPeriods,
  };
}
