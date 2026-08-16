import { TestBed } from '@angular/core/testing';
import { ApiService } from '../../core/api.service';
import type { Definition, QuestionDef } from '../../core/models';
import { DraftStore } from './draft-store';

const q = (code: string, sectionTitle: string): QuestionDef => ({
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

const draftOf = (...questions: QuestionDef[]): Definition => ({
  schemaVersion: 1,
  steps: [],
  tabs: [],
  questions,
});

describe('DraftStore.addQuestion section placement', () => {
  let store: DraftStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [DraftStore, { provide: ApiService, useValue: {} }],
    });
    store = TestBed.inject(DraftStore);
  });

  const codes = () => store.draft()!.questions.map((x) => x.code);

  it('joins the end of an existing section instead of creating a duplicate card', () => {
    store.draft.set(draftOf(q('food1', 'Food'), q('dessert1', 'Food'), q('colorBlack', 'Colors')));
    store.addQuestion(q('food2', 'Food'));
    expect(codes()).toEqual(['food1', 'dessert1', 'food2', 'colorBlack']);
  });

  it('appends at the very end when the section title is new on the screen', () => {
    store.draft.set(draftOf(q('food1', 'Food'), q('colorBlack', 'Colors')));
    store.addQuestion(q('pet1', 'Pets'));
    expect(codes()).toEqual(['food1', 'colorBlack', 'pet1']);
  });

  it('joins the last matching group when the user has deliberately split a section', () => {
    store.draft.set(draftOf(q('a', 'Food'), q('b', 'Colors'), q('c', 'Food')));
    store.addQuestion(q('d', 'Food'));
    expect(codes()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('treats blank section titles as one untitled section', () => {
    store.draft.set(draftOf(q('a', ''), q('b', 'Food')));
    store.addQuestion(q('c', ''));
    expect(codes()).toEqual(['a', 'c', 'b']);
  });
});
