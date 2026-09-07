import path from 'node:path';
import {
  listPublicMarketArchiveSnapshots,
  readPublicMarketArchiveSnapshot,
} from '../lib/public-market-snapshot-store';
import { assessPublicSourceStateWatch } from '../lib/public-source-state-watch';

function main() {
  const candidatePath = process.argv[2];
  if (!candidatePath) {
    throw new Error('Usage: npm run public:watch -- <candidate-snapshot.json> [committed-archive-directory]');
  }
  const archiveDirectory = path.resolve(process.argv[3] ?? 'data/public-market-snapshots');
  const candidate = readPublicMarketArchiveSnapshot(path.resolve(candidatePath));
  const archive = listPublicMarketArchiveSnapshots(archiveDirectory);
  const assessment = assessPublicSourceStateWatch(candidate, archive);
  process.stdout.write(`${JSON.stringify(assessment, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
