import fs from 'node:fs';
import path from 'node:path';
import { assessProviderIntegrationDecision } from '../lib/provider-integration-decision';

function usage(): never {
  console.error('Usage: npm run provider:decision -- <normalized-trial.json> <commercial-rights.json> [--json]');
  process.exit(2);
}

const trialArg = process.argv[2];
const rightsArg = process.argv[3];
if (!trialArg || !rightsArg || trialArg.startsWith('--') || rightsArg.startsWith('--')) usage();
const jsonOnly = process.argv.includes('--json');

function readJson(file: string) {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), file), 'utf8')) as unknown;
}

let trial: unknown;
let rights: unknown;
try {
  trial = readJson(trialArg);
  rights = readJson(rightsArg);
} catch (error) {
  console.error(`Unable to read provider decision input: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exit(2);
}

const decision = assessProviderIntegrationDecision(trial, rights);
if (jsonOnly) {
  console.log(JSON.stringify(decision, null, 2));
} else {
  console.log(`Provider integration decision: ${decision.providerId || '(unresolved provider)'}`);
  console.log(`Trial evidence: ${decision.trial.evidenceComplete ? 'COMPLETE' : 'INCOMPLETE'}`);
  console.log(`Commercial rights: ${decision.commercialRights.status.toUpperCase()}`);
  if (decision.blockers.length) {
    console.log('\nBlockers:');
    decision.blockers.forEach((blocker) => console.log(`- ${blocker}`));
  }
  console.log(`\nDecision: ${decision.status.toUpperCase()}`);
  console.log(`Boundary: ${decision.boundary}`);
}

process.exit(decision.status === 'ready_for_controlled_integration' ? 0 : 1);
