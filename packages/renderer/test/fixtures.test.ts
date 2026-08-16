/**
 * Loads every shared conformance fixture (BRD §6.6) and asserts the engine
 * matches. A future Java engine must pass these same files.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { evaluate, normalize, type AnswersMap, type Definition } from '../src/core/index.js';

interface Fixture {
  name: string;
  description: string;
  definitionFragment: Definition;
  answers: AnswersMap;
  expected: {
    visibleQuestionCodes: string[];
    requiredQuestionCodes: string[];
    clearedCodes: string[];
    capHit?: boolean;
  };
}

const fixturesDir = join(fileURLToPath(import.meta.url), '../../../../shared/rule-fixtures');
const files = readdirSync(fixturesDir).filter((f) => f.endsWith('.json'));

const sorted = (values: Iterable<string>) => [...values].sort();

describe('rule-engine conformance fixtures', () => {
  it('has a meaningful fixture corpus', () => {
    expect(files.length).toBeGreaterThanOrEqual(20);
  });

  for (const file of files) {
    const fixture: Fixture = JSON.parse(readFileSync(join(fixturesDir, file), 'utf8'));
    it(`${fixture.name} — ${fixture.description}`, () => {
      const norm = normalize(fixture.definitionFragment);
      const result = evaluate(norm, fixture.answers);
      expect(sorted(result.visibleQuestionCodes)).toEqual(sorted(fixture.expected.visibleQuestionCodes));
      expect(sorted(result.requiredQuestionCodes)).toEqual(sorted(fixture.expected.requiredQuestionCodes));
      expect(sorted(result.clearedCodes)).toEqual(sorted(fixture.expected.clearedCodes));
      expect(result.capHit).toBe(fixture.expected.capHit ?? false);
    });
  }
});
