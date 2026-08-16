import type { Condition, Definition, QuestionDef, RuleConfig } from '../../core/models';
import { answerShape, conditionIncompatibleWith, findIncompatibleRefs } from './impact';
import { buildCodeInfo } from './rule-builder.component';

const question = (code: string, type: string, extra: Partial<QuestionDef> = {}): QuestionDef => ({
  id: `id-${code || 'blk'}`,
  code,
  sectionTitle: '',
  prompt: code,
  type,
  width: 'DEFAULT',
  typeConfig: { size: 'MEDIUM', maxLength: null },
  visibility: { mode: 'ALWAYS' },
  requirement: { mode: 'NEVER' },
  ...extra,
});

const conditional = (...conditions: Condition[]): RuleConfig => ({
  mode: 'CONDITIONAL',
  rule: { combinator: 'ALL', conditions },
});

const draftOf = (...questions: QuestionDef[]): Definition => ({
  schemaVersion: 2,
  steps: [],
  tabs: [],
  questions,
});

const uploadConfig = { allowedCategories: ['DOCUMENTS'], maxFiles: 1, maxFileSizeMb: 10, helperText: '' };

describe('Phase-3 FILE_UPLOAD editor integration (§5, P3-D6)', () => {
  it('excludes FILE_UPLOAD questions from the rule builder targets (no operators)', () => {
    const info = buildCodeInfo([
      question('resume', 'FILE_UPLOAD', { typeConfig: uploadConfig }),
      question('name', 'TEXT_BOX'),
      question('', 'DISPLAY_BLOCK', { typeConfig: { content: 'hi' } }),
    ]);
    expect(Object.keys(info)).toEqual(['name']);
  });

  it('stores a distinct answer shape so type changes to/from FILE_UPLOAD trigger the FR2-15/FR3-15 modal', () => {
    expect(answerShape('FILE_UPLOAD')).toBe('files');
    expect(answerShape('FILE_UPLOAD')).not.toBe(answerShape('CHECKBOX'));
    expect(answerShape('FILE_UPLOAD')).not.toBe(answerShape('ADDRESS'));
    expect(answerShape('FILE_UPLOAD')).not.toBe(answerShape('TEXT_BOX'));
  });

  it('flags every condition referencing a question converted to FILE_UPLOAD (never referenceable)', () => {
    const updated = question('src', 'FILE_UPLOAD', { typeConfig: uploadConfig });
    const dependent = question('dep', 'TEXT_BOX', {
      visibility: conditional({ source: 'QUESTION', questionCode: 'src', operator: 'EQUALS', value: 'x' }),
    });
    expect(
      conditionIncompatibleWith(
        { source: 'QUESTION', questionCode: 'src', operator: 'EQUALS', value: 'x' },
        'src',
        updated,
      ),
    ).toBe(true);
    const refs = findIncompatibleRefs(draftOf(updated, dependent), 'src', updated);
    expect(refs).toHaveLength(1);
    expect(refs[0].failsOpen).toBe(true);
  });
});
