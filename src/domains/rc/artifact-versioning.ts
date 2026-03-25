/**
 * Artifact Versioning - adds schema version metadata to persisted JSON artifacts.
 *
 * Why: When DESIGN-INTAKE.json, BRAND-PROFILE.json, or DESIGN-SPEC.json
 * schemas evolve, downstream consumers need to know which version they're reading.
 * Without this, a stale artifact silently produces wrong behavior.
 *
 * Usage:
 *   const data = stampVersion('design-intake', 1, rawAssessment);
 *   fs.writeFileSync(path, JSON.stringify(data, null, 2));
 *
 *   const loaded = JSON.parse(fs.readFileSync(path, 'utf-8'));
 *   assertVersion(loaded, 'design-intake', 1); // throws if mismatch
 */

/** Known artifact types and their current schema versions */
export const ARTIFACT_VERSIONS = {
  'design-intake': 1,
  'brand-profile': 1,
  'design-spec': 1,
  'challenge-report': 1,
} as const;

export type ArtifactType = keyof typeof ARTIFACT_VERSIONS;

/** Metadata envelope added to persisted JSON artifacts */
export interface ArtifactMetadata {
  _meta: {
    artifactType: ArtifactType;
    schemaVersion: number;
    generatedAt: string;
    generator: string;
  };
}

/**
 * Stamp a raw data object with version metadata before persisting.
 * Returns a new object with `_meta` prepended (JSON will serialize it first).
 */
export function stampVersion<T extends Record<string, unknown>>(
  artifactType: ArtifactType,
  data: T,
): T & ArtifactMetadata {
  return {
    _meta: {
      artifactType,
      schemaVersion: ARTIFACT_VERSIONS[artifactType],
      generatedAt: new Date().toISOString(),
      generator: 'rc-engine',
    },
    ...data,
  };
}

/**
 * Assert that a loaded artifact matches the expected type and version.
 * Throws a clear error on mismatch - fail-fast instead of silent corruption.
 */
export function assertVersion(data: unknown, expectedType: ArtifactType, expectedVersion?: number): void {
  if (!data || typeof data !== 'object') {
    throw new Error(`Invalid artifact: expected object, got ${typeof data}`);
  }

  const record = data as Record<string, unknown>;
  const meta = record._meta as ArtifactMetadata['_meta'] | undefined;

  if (!meta) {
    // Legacy artifact without versioning - warn but allow (backward compatible)
    console.warn(
      `[artifact-versioning] ${expectedType}: no _meta found. ` +
        `Artifact may be from an older version. Consider re-generating.`,
    );
    return;
  }

  if (meta.artifactType !== expectedType) {
    throw new Error(
      `Artifact type mismatch: expected "${expectedType}", found "${meta.artifactType}". ` +
        `Check that you're reading the correct file.`,
    );
  }

  const expected = expectedVersion ?? ARTIFACT_VERSIONS[expectedType];
  if (meta.schemaVersion !== expected) {
    throw new Error(
      `Schema version mismatch for "${expectedType}": expected v${expected}, ` +
        `found v${meta.schemaVersion}. Re-run the tool to generate a compatible artifact.`,
    );
  }
}
