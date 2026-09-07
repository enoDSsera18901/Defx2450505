'use client';

import { FormEvent, useEffect, useState } from 'react';
import {
  buildScenarioLandedCostInput,
  type LandedCostScenarioRequest,
  type ObservedCrudeBasis,
} from '../../lib/landed-scenario';
import {
  calculateLandedCost,
  type LandedCostComponentKind,
  type LandedCostInput,
  type LandedCostResult,
} from '../../lib/landed-cost';
import {
  analyzeLandedCostSensitivity,
  explainLandedCost,
  type LandedCostEvidenceChain,
  type LandedCostSensitivityResult,
} from '../../lib/landed-cost-analysis';
import styles from './scenario.module.css';

type PricePoint = { period: string; value: number; units: string };
type MarketPayload = {
  source?: string;
  prices?: { brent?: PricePoint[] };
};

type FormValues = {
  crudeBasis: string;
  freight: string;
  insurance: string;
  portTerminal: string;
  differential: string;
  canalToll: string;
  financingTime: string;
};

type SensitivityMode = 'absolute_per_bbl' | 'percent_of_normalized_component';

const emptyValues: FormValues = {
  crudeBasis: '',
  freight: '',
  insurance: '',
  portTerminal: '',
  differential: '',
  canalToll: '',
  financingTime: '',
};

const labels: Record<LandedCostComponentKind, string> = {
  crude_basis: 'Crude basis',
  freight: 'Freight',
  insurance: 'Insurance',
  port_terminal: 'Port / terminal',
  canal_toll: 'Canal / toll',
  quality_location_differential: 'Quality / location differential',
  financing_time_cost: 'Financing / time cost',
};

function parseAmount(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function monthlyPeriodAsIso(period: string | undefined): string | null {
  if (!period || !/^\d{4}-\d{2}$/.test(period)) return null;
  const value = `${period}-01T00:00:00Z`;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

export default function ScenarioLabPage() {
  const [market, setMarket] = useState<MarketPayload | null>(null);
  const [feedState, setFeedState] = useState<'loading' | 'live' | 'unavailable'>('loading');
  const [useObservedBrent, setUseObservedBrent] = useState(true);
  const [canalApplies, setCanalApplies] = useState(false);
  const [financingApplies, setFinancingApplies] = useState(false);
  const [values, setValues] = useState<FormValues>(emptyValues);
  const [result, setResult] = useState<LandedCostResult | null>(null);
  const [baseInput, setBaseInput] = useState<LandedCostInput | null>(null);
  const [evidence, setEvidence] = useState<LandedCostEvidenceChain | null>(null);
  const [sensitivity, setSensitivity] = useState<LandedCostSensitivityResult | null>(null);
  const [sensitivityKind, setSensitivityKind] = useState<LandedCostComponentKind>('freight');
  const [sensitivityMode, setSensitivityMode] = useState<SensitivityMode>('absolute_per_bbl');
  const [sensitivityValue, setSensitivityValue] = useState('1');
  const [sensitivityInputError, setSensitivityInputError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/market')
      .then((response) => response.json())
      .then((payload) => {
        if (payload?.status === 'live' && payload?.data) {
          setMarket(payload.data as MarketPayload);
          setFeedState('live');
        } else {
          setFeedState('unavailable');
        }
      })
      .catch(() => setFeedState('unavailable'));
  }, []);

  const latestBrent = market?.prices?.brent?.[0] ?? null;
  const brentAsOf = monthlyPeriodAsIso(latestBrent?.period);
  const observedBrent: ObservedCrudeBasis | null =
    useObservedBrent && latestBrent && brentAsOf
      ? {
          benchmark: 'Brent',
          amount: latestBrent.value,
          currency: 'USD',
          asOf: brentAsOf,
          sourceRecordId: `EIA:RBRTE:${latestBrent.period}`,
        }
      : null;

  function resetOutputs() {
    setResult(null);
    setBaseInput(null);
    setEvidence(null);
    setSensitivity(null);
    setSensitivityInputError(null);
  }

  function setField(field: keyof FormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    resetOutputs();
  }

  function calculate(event: FormEvent) {
    event.preventDefault();
    const calculatedAt = new Date().toISOString();
    const calculationId = `scenario-${Date.now()}`;
    const request: LandedCostScenarioRequest = {
      calculationId,
      calculatedAt,
      observedCrudeBasis: observedBrent,
      assumptions: {
        crudeBasisPerBbl: observedBrent ? null : parseAmount(values.crudeBasis),
        freightPerBbl: parseAmount(values.freight),
        insurancePerBbl: parseAmount(values.insurance),
        portTerminalPerBbl: parseAmount(values.portTerminal),
        qualityLocationDifferentialPerBbl: parseAmount(values.differential),
        canalTollApplies: canalApplies,
        canalTollPerBbl: canalApplies ? parseAmount(values.canalToll) : null,
        financingTimeCostApplies: financingApplies,
        financingTimeCostPerBbl: financingApplies ? parseAmount(values.financingTime) : null,
      },
    };

    const input = buildScenarioLandedCostInput(request);
    const calculated = calculateLandedCost(input);
    const explained = explainLandedCost(input);

    setBaseInput(input);
    setResult(calculated);
    setEvidence(explained);
    setSensitivity(null);
    setSensitivityInputError(null);

    if (calculated.status === 'complete' && !calculated.components.some((component) => component.kind === sensitivityKind)) {
      setSensitivityKind(calculated.components[0]?.kind ?? 'crude_basis');
    }
  }

  function runSensitivity() {
    if (!baseInput || result?.status !== 'complete') return;
    const requested = Number(sensitivityValue);
    if (!Number.isFinite(requested)) {
      setSensitivity(null);
      setSensitivityInputError('Enter a finite stress value.');
      return;
    }

    setSensitivityInputError(null);
    const shock = sensitivityMode === 'absolute_per_bbl'
      ? {
          shockId: `ui-${sensitivityKind}-absolute`,
          componentKind: sensitivityKind,
          mode: 'absolute_per_bbl' as const,
          deltaPerBbl: requested,
          note: 'Scenario Lab analyst stress',
        }
      : {
          shockId: `ui-${sensitivityKind}-percent`,
          componentKind: sensitivityKind,
          mode: 'percent_of_normalized_component' as const,
          percent: requested,
          note: 'Scenario Lab analyst stress',
        };

    setSensitivity(analyzeLandedCostSensitivity(`ui-sensitivity-${result.calculationId}`, baseInput, [shock]));
  }

  return (
    <main className={styles.page}>
      <div className={styles.wrap}>
        <a className={styles.back} href="/">← Back to market overview</a>

        <header className={styles.hero}>
          <div>
            <p className={styles.sectionLabel}>DELIVERED ECONOMICS</p>
            <h1>Landed cost scenario lab</h1>
            <p>
              Combine a source-backed public crude benchmark with your explicit assumptions. Nothing entered here is presented as a live freight, cargo or route observation.
            </p>
          </div>
          <span className={styles.pill}>SCENARIO · NOT LIVE PHYSICAL DATA</span>
        </header>

        <div className={styles.grid}>
          <section className={styles.panel}>
            <p className={styles.sectionLabel}>INPUTS</p>
            <h2>Build a USD/bbl scenario</h2>
            <p className={styles.subtle}>Required fields stay incomplete until you provide them. Blank values never become zero.</p>

            <div className={styles.sourceBox}>
              <div className={styles.sourceTop}>
                <strong>Crude price basis</strong>
                <span className={feedState === 'live' && latestBrent ? styles.good : styles.warn}>
                  {feedState === 'loading' ? 'CONNECTING' : feedState === 'live' && latestBrent ? 'EIA AVAILABLE' : 'NO PUBLIC BASIS'}
                </span>
              </div>
              {latestBrent ? (
                <div className={styles.sourceMeta}>
                  Latest EIA monthly Brent observation: ${latestBrent.value.toFixed(2)}/bbl · {latestBrent.period} · RBRTE.
                </div>
              ) : (
                <div className={styles.sourceMeta}>The public Brent feed is unavailable. You may enter a scenario crude basis instead.</div>
              )}
              <div className={styles.toggleRow} style={{ marginTop: 10 }}>
                <div className={styles.toggleLabel}>
                  <strong>Use EIA Brent when available</strong>
                  <span>Observed public benchmark; scenario assumptions still make the final total a scenario.</span>
                </div>
                <input
                  className={styles.checkbox}
                  type="checkbox"
                  checked={useObservedBrent}
                  disabled={!latestBrent || !brentAsOf}
                  onChange={(event) => {
                    setUseObservedBrent(event.target.checked);
                    resetOutputs();
                  }}
                />
              </div>
            </div>

            <form onSubmit={calculate}>
              <div className={styles.formGrid}>
                <div className={styles.field}>
                  <label htmlFor="crude">Scenario crude basis · USD/bbl</label>
                  <input
                    id="crude"
                    className={styles.input}
                    type="number"
                    step="0.01"
                    min="0"
                    disabled={Boolean(observedBrent)}
                    value={values.crudeBasis}
                    onChange={(event) => setField('crudeBasis', event.target.value)}
                    placeholder={observedBrent ? `Using EIA ${latestBrent?.value.toFixed(2)}` : 'Required without EIA basis'}
                  />
                  <span className={styles.hint}>{observedBrent ? 'Source-backed EIA basis selected.' : 'Explicit scenario assumption; not market data.'}</span>
                </div>

                <ScenarioField id="freight" label="Freight · USD/bbl" value={values.freight} onChange={(value) => setField('freight', value)} required />
                <ScenarioField id="insurance" label="Insurance · USD/bbl" value={values.insurance} onChange={(value) => setField('insurance', value)} required />
                <ScenarioField id="port" label="Port / terminal · USD/bbl" value={values.portTerminal} onChange={(value) => setField('portTerminal', value)} required />
                <ScenarioField id="diff" label="Quality / location differential · USD/bbl" value={values.differential} onChange={(value) => setField('differential', value)} required allowNegative />
              </div>

              <div className={styles.optional}>
                <div className={styles.toggleRow}>
                  <div className={styles.toggleLabel}><strong>Canal / toll applies</strong><span>Leave off only when the scenario route genuinely avoids a canal/toll.</span></div>
                  <input className={styles.checkbox} type="checkbox" checked={canalApplies} onChange={(event) => { setCanalApplies(event.target.checked); resetOutputs(); }} />
                </div>
                {canalApplies && <ScenarioField id="canal" label="Canal / toll · USD/bbl" value={values.canalToll} onChange={(value) => setField('canalToll', value)} required />}

                <div className={styles.toggleRow}>
                  <div className={styles.toggleLabel}><strong>Financing / time cost applies</strong><span>Switch on when you want the scenario to include carrying/time cost.</span></div>
                  <input className={styles.checkbox} type="checkbox" checked={financingApplies} onChange={(event) => { setFinancingApplies(event.target.checked); resetOutputs(); }} />
                </div>
                {financingApplies && <ScenarioField id="finance" label="Financing / time cost · USD/bbl" value={values.financingTime} onChange={(value) => setField('financingTime', value)} required />}
              </div>

              <div className={styles.actions}><button className={styles.button} type="submit">Calculate scenario</button></div>
            </form>
          </section>

          <section className={styles.panel}>
            <p className={styles.sectionLabel}>RESULT</p>
            <h2>Evidence-aware delivered cost</h2>
            <p className={styles.subtle}>The engine refuses a number if an applicable component is missing.</p>

            {!result && <div className={styles.resultEmpty}>Enter the required assumptions and calculate. No default freight, fees or insurance values are preloaded.</div>}

            {result?.status === 'incomplete' && (
              <>
                <div className={styles.noTotal}>No total issued</div>
                <div className={styles.statusLine}>INCOMPLETE · missing or invalid evidence</div>
                <ul className={styles.errors}>{result.errors.map((error) => <li key={error}>{error}</li>)}</ul>
              </>
            )}

            {result?.status === 'complete' && (
              <>
                <div className={styles.resultHero}>
                  <span>{result.evidenceClass.toUpperCase()} LANDED COST</span>
                  <strong>${result.amount.toFixed(2)}</strong>
                  <small>{result.currency}/bbl · arithmetic result, not a market quote</small>
                </div>
                <div className={styles.rows}>
                  {result.components.map((component) => (
                    <div className={styles.row} key={component.kind}>
                      <span>{labels[component.kind]} · {component.evidenceClass}</span>
                      <strong>{component.amount < 0 ? '−' : ''}${Math.abs(component.amount).toFixed(2)}</strong>
                    </div>
                  ))}
                </div>

                <div className={styles.analysisBox}>
                  <p className={styles.sectionLabel}>ANALYST STRESS · SCENARIO ONLY</p>
                  <h3>One-at-a-time sensitivity</h3>
                  <p className={styles.analysisText}>Stress one normalized component. The base source observations remain unchanged and the stressed result is always scenario-labelled.</p>
                  <div className={styles.analysisGrid}>
                    <div className={styles.field}>
                      <label htmlFor="sensitivity-component">Component</label>
                      <select
                        id="sensitivity-component"
                        className={styles.input}
                        value={sensitivityKind}
                        onChange={(event) => { setSensitivityKind(event.target.value as LandedCostComponentKind); setSensitivity(null); }}
                      >
                        {result.components.map((component) => <option key={component.kind} value={component.kind}>{labels[component.kind]}</option>)}
                      </select>
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="sensitivity-mode">Stress basis</label>
                      <select
                        id="sensitivity-mode"
                        className={styles.input}
                        value={sensitivityMode}
                        onChange={(event) => { setSensitivityMode(event.target.value as SensitivityMode); setSensitivity(null); }}
                      >
                        <option value="absolute_per_bbl">Absolute target-currency / bbl</option>
                        <option value="percent_of_normalized_component">Percent of normalized component</option>
                      </select>
                    </div>
                    <div className={styles.fieldFull}>
                      <label htmlFor="sensitivity-value">{sensitivityMode === 'absolute_per_bbl' ? 'Change · USD/bbl' : 'Change · percent'}</label>
                      <div className={styles.inlineAction}>
                        <input id="sensitivity-value" className={styles.input} type="number" step="0.01" value={sensitivityValue} onChange={(event) => { setSensitivityValue(event.target.value); setSensitivity(null); setSensitivityInputError(null); }} />
                        <button className={styles.secondaryButton} type="button" onClick={runSensitivity}>Run stress</button>
                      </div>
                    </div>
                  </div>
                  {sensitivityInputError && <div className={styles.analysisError}>{sensitivityInputError}</div>}
                  {sensitivity?.status === 'incomplete' && <ul className={styles.errors}>{sensitivity.errors.map((error) => <li key={error}>{error}</li>)}</ul>}
                  {sensitivity?.status === 'complete' && sensitivity.points[0] && (
                    <div className={styles.stressResult}>
                      <span>SCENARIO STRESSED LANDED COST</span>
                      <strong>${sensitivity.points[0].stressedLandedCost.toFixed(2)}</strong>
                      <small>
                        {sensitivity.points[0].landedCostDelta >= 0 ? '+' : '−'}${Math.abs(sensitivity.points[0].landedCostDelta).toFixed(2)}/bbl vs base · {sensitivity.points[0].landedCostDeltaPercent >= 0 ? '+' : ''}{sensitivity.points[0].landedCostDeltaPercent.toFixed(2)}%
                      </small>
                    </div>
                  )}
                </div>

                {evidence?.status === 'complete' && (
                  <div className={styles.analysisBox}>
                    <p className={styles.sectionLabel}>EVIDENCE CHAIN</p>
                    <h3>Why this total exists</h3>
                    <p className={styles.analysisText}>Each contribution retains its input evidence and source record IDs through normalization. Source IDs reference upstream records; they are not replaced by the arithmetic result.</p>
                    <div className={styles.evidenceList}>
                      {evidence.components.map((entry) => entry.status === 'not_applicable' ? (
                        <div className={styles.evidenceItem} key={entry.componentKind}>
                          <div><strong>{labels[entry.componentKind]}</strong><span>not applicable</span></div>
                          <p>{entry.rationale}</p>
                        </div>
                      ) : (
                        <div className={styles.evidenceItem} key={entry.componentKind}>
                          <div>
                            <strong>{labels[entry.componentKind]}</strong>
                            <span>{entry.inputEvidenceClass} → ${entry.normalizedAmount.toFixed(2)} {entry.targetCurrency}/bbl</span>
                          </div>
                          <p>Source: {entry.inputSourceRecordIds.join(', ')}</p>
                          {entry.inputMethodId && <p>Method: {entry.inputMethodId}</p>}
                          {entry.fx && <p>FX: {entry.fx.rate} {entry.fx.fromCurrency}→{entry.fx.toCurrency} · source {entry.fx.sourceRecordIds.join(', ')}</p>}
                        </div>
                      ))}
                    </div>
                    <div className={styles.aggregationLine}>Aggregation: {evidence.aggregation.methodId} · {evidence.aggregation.formula}</div>
                  </div>
                )}
              </>
            )}

            <div className={styles.integrity}>
              <strong>Integrity boundary:</strong> EIA Brent may enter as an observed public benchmark. Every manual cost is recorded as a scenario assumption. Commercial maritime data is not queried, simulated as live, or inferred from tanker class/location.
            </div>
          </section>
        </div>

        <footer className={styles.footer}>LASTBARREL · SCENARIO LAB · NO COMMERCIAL MARITIME DATA CONNECTED</footer>
      </div>
    </main>
  );
}

function ScenarioField({
  id,
  label,
  value,
  onChange,
  required,
  allowNegative = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  allowNegative?: boolean;
}) {
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className={styles.input}
        type="number"
        step="0.01"
        min={allowNegative ? undefined : '0'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={required ? 'Required scenario assumption' : 'Optional'}
      />
      <span className={styles.hint}>Scenario assumption · never treated as observed data.</span>
    </div>
  );
}
