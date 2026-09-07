import fs from 'node:fs';
import path from 'node:path';
import { assessProviderCommercialRights } from '../lib/provider-commercial-rights';

function usage(): never {
  console.error('Usage: npm run commercial:report -- <commercial-rights.json> [--json]');
  process.exit(2);
}

const fileArg = process.argv[2];
if (!fileArg || fileArg.startsWith('--')) usage();

const jsonOnly = process.argv.includes('--json');
const filePath = path.resolve(process.cwd(), fileArg);

let packet: unknown;
try {
  packet = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
} catch (error) {
  console.error(`Unable to read commercial-rights packet: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exit(2);
}

const assessment = assessProviderCommercialRights(packet);

if (jsonOnly) {
  console.log(JSON.stringify(assessment, null, 2));
} else {
  console.log(`Provider commercial-rights gate: ${assessment.providerId || '(missing provider)'}`);
  console.log(`Licence tag: ${assessment.licenceTag || '(missing)'}`);
  console.log(`Reviewed: ${assessment.reviewedAt || '(missing timestamp)'}`);
  console.log(`Source documents: ${assessment.sourceDocumentIds.length ? assessment.sourceDocumentIds.join(', ') : '(none)'}`);

  if (assessment.conditionalRights.length) {
    console.log('\nConditional rights:');
    for (const term of assessment.conditionalRights) {
      console.log(`- ${term.right}: ${term.conditions.join(' | ')}`);
    }
  }

  if (assessment.validationErrors.length) {
    console.log('\nValidation errors:');
    assessment.validationErrors.forEach((error) => console.log(`- ${error}`));
  }

  if (assessment.blockers.length) {
    console.log('\nRelease blockers:');
    assessment.blockers.forEach((blocker) => console.log(`- ${blocker}`));
  }

  console.log(
    `\nCommercial release gate: ${assessment.status.toUpperCase()} ` +
      '(internal evidence control only; not a legal opinion or provider-quality approval).',
  );
}

process.exit(assessment.status === 'ready' ? 0 : 1);
