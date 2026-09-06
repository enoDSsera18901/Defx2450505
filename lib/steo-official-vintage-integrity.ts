import {
  readOfficialSteoVintage,
  writeOfficialSteoVintage,
  type OfficialSteoVintage,
  type StoredOfficialSteoVintage,
} from './steo-official-vintage';

function stableNormalization(vintage: OfficialSteoVintage) {
  const { importedAt: _importedAt, ...stable } = vintage;
  return JSON.stringify(stable);
}

/**
 * Persist a normalized official EIA vintage without silently reusing stale
 * normalization output for the same raw source artifact.
 *
 * `importedAt` is intentionally excluded from the equality check: repeat
 * retrieval of an unchanged official workbook should be idempotent. Every
 * source-derived field must otherwise match the normalization already stored
 * under that raw artifact SHA-256.
 */
export function writeVerifiedOfficialSteoVintage(
  vintage: OfficialSteoVintage,
  directory: string,
): StoredOfficialSteoVintage {
  const stored = writeOfficialSteoVintage(vintage, directory);
  if (stored.created) return stored;

  const existing = readOfficialSteoVintage(stored.path);
  if (stableNormalization(existing) !== stableNormalization(vintage)) {
    throw new Error(
      `Official STEO source artifact ${vintage.sourceArtifactSha256} already exists with different normalized content; parser/source semantics changed and require explicit review`,
    );
  }
  return stored;
}
