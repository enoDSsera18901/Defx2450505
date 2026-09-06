import fs from 'node:fs';
import path from 'node:path';
import { evaluateProviderTrial } from '../lib/provider-trial';

function usage(): never {
  console.error('Usage: npm run trial:report -- <normalized-trial.json> [--json]');
  process.exit(2);
}

const fileArg = process.argv[2];
if (!fileArg || fileArg.startsWith('--')) usage();

const jsonOnly = process.argv.includes('--json');
const filePath = path.resolve(process.cwd(), fileArg);

let dataset: unknown;
try {
  dataset = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
} catch (error) {
  console.error(`Unable to read trial dataset: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exit(2);
}

const report = evaluateProviderTrial(dataset);

if (jsonOnly) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Provider trial evidence report: ${report.providerId || '(missing provider)'}`);
  console.log(`Captured: ${report.capturedAt || '(missing timestamp)'}`);
  console.log(`Records: ${report.recordCounts.total} total; ${report.recordCounts.vesselAndCargo} vessel/cargo`);
  console.log(
    `Cargo coverage: ${report.cargoCoverage.withGrade}/${report.cargoCoverage.cargoes} grade, ` +
      `${report.cargoCoverage.withQuantity}/${report.cargoCoverage.cargoes} quantity, ` +
      `${report.cargoCoverage.withDestination}/${report.cargoCoverage.cargoes} destination`,
  );
  console.log(
    `Freshness: ${report.freshness.fresh} fresh, ${report.freshness.stale} stale, ` +
      `${report.freshness.unknown} unknown, ${report.freshness.future} future`,
  );
  console.log('');

  for (const check of report.checks) {
    console.log(`${check.pass ? 'PASS' : 'FAIL'}  ${check.id}: ${check.detail}`);
  }

  if (report.errors.length) {
    console.log('\nValidation errors:');
    report.errors.forEach((error) => console.log(`- ${error}`));
  }

  console.log(
    `\nEvidence packet: ${report.evidenceComplete ? 'complete for manual trial review' : 'incomplete'} ` +
      '(this is not a provider-quality or licensing approval).',
  );
}

process.exit(report.evidenceComplete ? 0 : 1);
