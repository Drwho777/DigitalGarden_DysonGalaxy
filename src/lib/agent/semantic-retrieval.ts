export function isSemanticRetrievalEnabled(
  env: Record<string, string | undefined>,
) {
  return env.ENABLE_SEMANTIC_RETRIEVAL?.trim().toLowerCase() === 'true';
}
