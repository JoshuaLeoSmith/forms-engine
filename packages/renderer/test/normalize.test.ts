import { describe, expect, it } from 'vitest';
import {
  groupSections,
  normalize,
  SYNTHETIC_STEP_ID,
  syntheticTabId,
  type Definition,
  type QuestionDef,
} from '../src/core/index.js';

const q = (code: string, sectionTitle = ''): QuestionDef => ({
  id: `id-${code}`,
  code,
  sectionTitle,
  prompt: code,
  type: 'TEXT_BOX',
  width: 'DEFAULT',
  typeConfig: { size: 'MEDIUM' },
  visibility: { mode: 'ALWAYS' },
  requirement: { mode: 'NEVER' },
});

describe('normalize (§5.1)', () => {
  it('wraps questions-only definitions in one synthetic step + tab', () => {
    const def: Definition = { schemaVersion: 1, steps: [], tabs: [], questions: [q('a'), q('b')] };
    const norm = normalize(def);
    expect(norm.steps).toHaveLength(1);
    expect(norm.steps[0].synthetic).toBe(true);
    expect(norm.steps[0].id).toBe(SYNTHETIC_STEP_ID);
    expect(norm.steps[0].tabs).toHaveLength(1);
    expect(norm.steps[0].tabs[0].synthetic).toBe(true);
    expect(norm.steps[0].tabs[0].id).toBe(syntheticTabId(SYNTHETIC_STEP_ID));
    expect(norm.steps[0].tabs[0].questions.map((x) => x.code)).toEqual(['a', 'b']);
  });

  it('wraps top-level tabs in one synthetic step keeping real tabs', () => {
    const def: Definition = {
      schemaVersion: 1,
      steps: [],
      tabs: [
        { id: 't1', title: 'T1', visibility: { mode: 'ALWAYS' }, requirement: { mode: 'NEVER' }, questions: [q('a')] },
        { id: 't2', title: 'T2', visibility: { mode: 'ALWAYS' }, requirement: { mode: 'NEVER' }, questions: [q('b')] },
      ],
      questions: [],
    };
    const norm = normalize(def);
    expect(norm.steps).toHaveLength(1);
    expect(norm.steps[0].synthetic).toBe(true);
    expect(norm.steps[0].tabs.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(norm.steps[0].tabs.every((t) => !t.synthetic)).toBe(true);
  });

  it('gives a step with direct questions one synthetic tab', () => {
    const def: Definition = {
      schemaVersion: 1,
      steps: [
        { id: 's1', title: 'S1', visibility: { mode: 'ALWAYS' }, requirement: { mode: 'NEVER' }, tabs: [], questions: [q('a')] },
      ],
      tabs: [],
      questions: [],
    };
    const norm = normalize(def);
    expect(norm.steps[0].synthetic).toBe(false);
    expect(norm.steps[0].tabs).toHaveLength(1);
    expect(norm.steps[0].tabs[0].synthetic).toBe(true);
    expect(norm.steps[0].tabs[0].id).toBe(syntheticTabId('s1'));
  });

  it('synthetic containers always pass visibility and never cascade requirement', () => {
    const def: Definition = { schemaVersion: 1, steps: [], tabs: [], questions: [q('a')] };
    const norm = normalize(def);
    expect(norm.steps[0].visibility.mode).toBe('ALWAYS');
    expect(norm.steps[0].requirement.mode).toBe('NEVER');
    expect(norm.steps[0].tabs[0].visibility.mode).toBe('ALWAYS');
    expect(norm.steps[0].tabs[0].requirement.mode).toBe('NEVER');
  });

  it('collects questions in reading order and indexes by code', () => {
    const def: Definition = {
      schemaVersion: 1,
      steps: [
        {
          id: 's1', title: 'S1', visibility: { mode: 'ALWAYS' }, requirement: { mode: 'NEVER' },
          tabs: [
            { id: 't1', title: 'T1', visibility: { mode: 'ALWAYS' }, requirement: { mode: 'NEVER' }, questions: [q('a'), q('b')] },
            { id: 't2', title: 'T2', visibility: { mode: 'ALWAYS' }, requirement: { mode: 'NEVER' }, questions: [q('c')] },
          ],
          questions: [],
        },
        { id: 's2', title: 'S2', visibility: { mode: 'ALWAYS' }, requirement: { mode: 'NEVER' }, tabs: [], questions: [q('d')] },
      ],
      tabs: [],
      questions: [],
    };
    const norm = normalize(def);
    expect(norm.questions.map((x) => x.code)).toEqual(['a', 'b', 'c', 'd']);
    expect(norm.questionsByCode.get('c')?.id).toBe('id-c');
  });
});

describe('groupSections (§5.1)', () => {
  it('groups consecutive questions by identical sectionTitle', () => {
    const sections = groupSections([q('a', 'Food'), q('b', 'Food'), q('c', 'Colors'), q('d', 'Food')]);
    expect(sections.map((s) => [s.title, s.questions.map((x) => x.code)])).toEqual([
      ['Food', ['a', 'b']],
      ['Colors', ['c']],
      ['Food', ['d']],
    ]);
  });

  it('renders a blank sectionTitle as an untitled card group', () => {
    const sections = groupSections([q('a', ''), q('b', '')]);
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe('');
  });
});
