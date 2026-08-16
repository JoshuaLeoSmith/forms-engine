import { describe, expect, it } from 'vitest';
import { answeredCount, fileCount, prettyAnswers } from './response-utils';

describe('responses browser helpers (Phase 4 FR4-10)', () => {
  const answers: Record<string, unknown> = {
    food1: 'pizza',
    partySize: 0,
    newsletter: false,
    toppings: ['Mushroom', 'Onion'],
    homeAddr: { country: 'US', line1: '12 Main St' },
    resume: [
      { fileId: 'f_1', fileName: 'cv.pdf', size: 100, contentType: 'application/pdf' },
      { fileId: 'f_2', fileName: 'cover.pdf', size: 200, contentType: 'application/pdf' },
    ],
    gallery: [{ fileId: 'f_3', fileName: 'pic.png', size: 300, contentType: 'image/png' }],
  };

  it('counts answered questions as keys in the flat map (0/false are answers)', () => {
    expect(answeredCount(answers)).toBe(7);
    expect(answeredCount({})).toBe(0);
  });

  it('counts uploaded files across FILE_UPLOAD answers only', () => {
    expect(fileCount(answers)).toBe(3);
    // CHECKBOX string arrays are not file references.
    expect(fileCount({ toppings: ['a', 'b'] })).toBe(0);
    expect(fileCount({})).toBe(0);
  });

  it('pretty-prints the raw answers JSON for the row expansion', () => {
    const printed = prettyAnswers({ a: 1 });
    expect(printed).toContain('"a": 1');
    expect(printed.split('\n').length).toBeGreaterThan(1);
  });
});
