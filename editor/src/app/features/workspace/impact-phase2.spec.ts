import { TestBed } from '@angular/core/testing';
import { ApiService } from '../../core/api.service';
import type { Condition, Definition, QuestionDef, RuleConfig } from '../../core/models';
import { DraftStore } from './draft-store';
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
  schemaVersion: 1,
  steps: [],
  tabs: [],
  questions,
});

describe('Phase-2 type-change impact (FR2-15)', () => {
  const source = question('src', 'RADIO', {
    typeConfig: { options: [{ id: 'o1', label: 'Cake' }] },
  });
  const dependent = question('dep', 'TEXT_BOX', {
    visibility: conditional({ source: 'QUESTION', questionCode: 'src', operator: 'EQUALS', value: 'Cake' }),
  });

  it('flags EQUALS conditions when the target becomes a CHECKBOX (operator matrix §4.2)', () => {
    const updated = question('src', 'CHECKBOX', {
      typeConfig: { options: [{ id: 'o1', label: 'Cake' }], maxSelections: null },
    });
    expect(
      conditionIncompatibleWith(
        { source: 'QUESTION', questionCode: 'src', operator: 'EQUALS', value: 'Cake' },
        'src',
        updated,
      ),
    ).toBe(true);
    const refs = findIncompatibleRefs(draftOf(updated, dependent), 'src', updated);
    expect(refs).toHaveLength(1);
    expect(refs[0].failsOpen).toBe(true);
  });

  it('keeps string EQUALS conditions when the target stays string-shaped (RADIO→DROPDOWN)', () => {
    const updated = question('src', 'DROPDOWN', {
      typeConfig: { options: [{ id: 'o1', label: 'Cake' }] },
    });
    expect(findIncompatibleRefs(draftOf(updated, dependent), 'src', updated)).toHaveLength(0);
    expect(answerShape('RADIO')).toBe(answerShape('DROPDOWN'));
  });

  it('flags string-valued conditions when the target becomes a NUMBER (typed values, FR2-7)', () => {
    const updated = question('src', 'NUMBER', {
      typeConfig: { min: null, max: null, decimalPlaces: null, adornment: 'NONE', currencySymbol: '$' },
    });
    expect(
      conditionIncompatibleWith(
        { source: 'QUESTION', questionCode: 'src', operator: 'EQUALS', value: 'Cake' },
        'src',
        updated,
      ),
    ).toBe(true);
  });

  it('requires subField on ADDRESS targets and rejects it elsewhere (FR2-6)', () => {
    const address = question('src', 'ADDRESS', {
      typeConfig: {
        enabledFields: { state: true },
        requiredFields: {},
        defaultCountry: 'US',
        autocomplete: true,
      },
    });
    const noSub: Condition = { source: 'QUESTION', questionCode: 'src', operator: 'EQUALS', value: 'NJ' };
    const withSub: Condition = { ...noSub, subField: 'state' };
    const disabledSub: Condition = { ...noSub, subField: 'postalCode' };
    expect(conditionIncompatibleWith(noSub, 'src', address)).toBe(true);
    expect(conditionIncompatibleWith(withSub, 'src', address)).toBe(false);
    expect(conditionIncompatibleWith(disabledSub, 'src', address)).toBe(true);
    expect(conditionIncompatibleWith(withSub, 'src', question('src', 'TEXT_BOX'))).toBe(true);
  });
});

describe('DraftStore Phase-2 behaviors', () => {
  let store: DraftStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [DraftStore, { provide: ApiService, useValue: {} }],
    });
    store = TestBed.inject(DraftStore);
  });

  it('bumps schemaVersion to 2 on any edit (FR2-2)', () => {
    store.draft.set(draftOf(question('a', 'TEXT_BOX')));
    expect(store.draft()!.schemaVersion).toBe(1);
    store.addQuestion(question('b', 'TEXT_BOX'));
    expect(store.draft()!.schemaVersion).toBe(2);
  });

  it('removes now-invalid conditions on type change, failing open (FR2-15 + D-2b)', () => {
    const src = question('src', 'RADIO', { typeConfig: { options: [{ id: 'o1', label: 'Cake' }] } });
    const dep = question('dep', 'TEXT_BOX', {
      visibility: conditional({ source: 'QUESTION', questionCode: 'src', operator: 'EQUALS', value: 'Cake' }),
    });
    store.draft.set(draftOf(src, dep));
    const toggled = question('src', 'TOGGLE', {
      typeConfig: { trueLabel: 'Yes', falseLabel: 'No' },
    });
    store.updateQuestion(toggled, 'src', 'RADIO');
    const updatedDep = store.draft()!.questions.find((x) => x.code === 'dep')!;
    expect(updatedDep.visibility).toEqual({ mode: 'ALWAYS' });
  });

  it('excludes codeless DISPLAY_BLOCK entries from allCodes and code info (§6.9)', () => {
    const block = question('', 'DISPLAY_BLOCK', { typeConfig: { content: 'hello' } });
    store.draft.set(draftOf(question('a', 'TEXT_BOX'), block));
    expect(store.allCodes()).toEqual(['a']);
    expect(Object.keys(buildCodeInfo(store.norm()!.questions))).toEqual(['a']);
  });
});
