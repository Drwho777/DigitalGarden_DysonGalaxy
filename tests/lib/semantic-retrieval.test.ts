import { describe, expect, it } from 'vitest';
import { isSemanticRetrievalEnabled } from '../../src/lib/agent/semantic-retrieval';

describe('isSemanticRetrievalEnabled', () => {
  it('reads semantic retrieval enablement from a pure env object', () => {
    expect(
      isSemanticRetrievalEnabled({ ENABLE_SEMANTIC_RETRIEVAL: 'true' }),
    ).toBe(true);
    expect(
      isSemanticRetrievalEnabled({ ENABLE_SEMANTIC_RETRIEVAL: 'false' }),
    ).toBe(false);
    expect(isSemanticRetrievalEnabled({})).toBe(false);
  });
});
