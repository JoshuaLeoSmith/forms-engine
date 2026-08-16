# Adding a question type

This walkthrough proves the extensibility mandate (NFR-6, re-verified by
Phase 2's nine new types): a new question type requires **only new registry
modules** — zero changes to navigation, persistence, the rule-engine core, or
the schema. The worked example is `EMAIL`, the smallest real Phase-2 type
(NFR2-4) — every snippet below is the actual shipped code, lightly trimmed.

A question type owns (Phase 1 §5.4, Phase 2 §4.2):

1. a `type` identifier,
2. its `typeConfig` shape + validation,
3. an editor config panel,
4. a renderer input (live + inert preview),
5. its answer value shape (string, number, boolean, string[], or a flat
   string-valued object — Phase 2 §3),
6. the rule operators conditions may use against it (**the §4.2 matrix lives
   in the registry, not in rule-engine core**),
7. format validation of a stored answer (blocks navigation like a missing
   required answer, §6.6).

## 1. Core module — `packages/renderer/src/core/registry.ts`

The framework-free half: answer semantics, config validation, operators.

```ts
/** Pragmatic, not RFC 5321: one @, non-empty local part, dotted domain, no spaces. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const EMAIL: QuestionTypeCore = {
  type: 'EMAIL',
  label: 'Email',
  // false only for content entries like DISPLAY_BLOCK (no code, no answers,
  // never referenceable, never gated).
  answerable: true,
  // The §4.2 operator/type matrix, declared here. The rule builder filters
  // its operator dropdown from this; the backend validator enforces it.
  // An answerable type may declare NO operators (Phase 3's FILE_UPLOAD does):
  // it then answers and gates normally but is excluded from the rule builder
  // and rejected as a condition target by publish validation.
  allowedOperators: ['EQUALS', 'NOT_EQUALS'],
  // What the rule builder's value input should collect for conditions
  // targeting this type: 'text' | 'option' | 'number' | 'boolean' | 'date'
  // | 'address' | 'none'.
  conditionValueKind: 'text',
  defaultConfig: () => ({}),
  validateConfig: () => [],
  // "Answered" for gating (§3). NUMBER/TOGGLE use key-presence — never
  // truthiness (0 and false are answers).
  isAnswered: (value) => typeof value === 'string' && value.trim().length > 0,
  // Format validation of a STORED answer. A non-null message blocks forward
  // navigation even when the question is optional (§6.6).
  validateAnswer: (value) =>
    typeof value === 'string' && EMAIL_PATTERN.test(value)
      ? null
      : 'Enter a valid email address.',
};

registerQuestionType(EMAIL);
```

The rule engine, gating, clearing loop, unknown-type fallback, and
persistence pick the module up automatically — they only talk to the
registry. A type the registry does not know renders the FR2-9 placeholder and
never blocks gating, so old pinned renderers degrade safely when you ship new
types.

## 2. Renderer template — `packages/renderer/src/component/question-renderers.ts`

`onChange` takes the **typed** answer value (`undefined` clears the key);
`ctx.error` carries the message computed from `validateAnswer`; `onFieldError`
reports unparseable in-flight input that never became an answer (the DATE type
uses it — most types don't need it).

```ts
registerQuestionRenderer('EMAIL', (ctx) => html`
  <div class="fe-field">
    <label class="fe-label" for=${'fe-q-' + ctx.question.id}>${ctx.question.prompt}</label>
    <input
      class="fe-input ${ctx.invalid ? 'fe-invalid' : ''}"
      id=${'fe-q-' + ctx.question.id}
      type="text"
      inputmode="email"
      autocomplete="email"
      .defaultValue=${typeof ctx.value === 'string' ? ctx.value : ''}
      ?disabled=${ctx.disabled}
      @input=${(e: Event) => {
        const trimmed = (e.target as HTMLInputElement).value.trim();
        ctx.onChange(trimmed.length === 0 ? undefined : trimmed);
      }}
    />
    ${renderValidationMessage(ctx)}
  </div>
`);
```

Stateful controls (searchable dropdown, calendar, address group) are internal
light-DOM Lit elements (`fe-select`, `fe-date-input`, `fe-address`) you can
reuse from your own renderers.

## 3. Editor registry entry — `editor/src/app/features/workspace/types/`

Two small standalone components — a config panel (inputs `{ config,
onChange }`) and an inert preview (input `{ question }`); EMAIL's "panel" just
says there is nothing to configure:

```ts
registerEditorQuestionType({
  type: 'EMAIL',
  label: 'Email',
  panel: NoConfigComponent,
  preview: EmailPreviewComponent,
  defaultConfig: () => getQuestionType('EMAIL')!.defaultConfig(),
  validateConfig: (config) => getQuestionType('EMAIL')!.validateConfig(config),
});
```

The Add/Edit Question modal's type dropdown, config area, the canvas preview,
the FR2-14 config-discard confirm, and the FR2-15 type-change impact tooling
now all cover `EMAIL` — no modal, canvas, or store changes. The rule builder
adapts on its own: it reads `allowedOperators` and `conditionValueKind` from
the core module.

## 4. Backend validator bean — `backend/src/main/java/io/formsengine/validation/`

The backend's type registry collects every `QuestionTypeValidator` bean; for
EMAIL the config is empty so validation is trivial:

```java
@Component
public class EmailTypeValidator implements QuestionTypeValidator {
  public String type() { return "EMAIL"; }
  public List<String> validateConfig(Map<String, Object> config, boolean strict) {
    return List.of();
  }
}
```

Add the type's row to the backend's operator-compatibility matrix (the Java
mirror of `allowedOperators`) so publish validation (FR2-3) accepts rules
targeting it.

## 5. New operators (optional)

`operator` is an open string enum. Phase 2 exercised this: `CONTAINS`/
`NOT_CONTAINS` (checkbox), `GREATER_THAN`/`LESS_THAN` (number), `BEFORE`/
`AFTER` (date) were added by (a) implementing them in `evaluateCondition`
(`packages/renderer/src/core/engine.ts`), (b) listing them in the owning
type's `allowedOperators`, (c) mirroring both in the backend validator, and
(d) adding conformance fixtures in `shared/rule-fixtures/`. Unknown operators
evaluate to `false` by design, so shipping a type first and its operators
later is safe.

## Checklist

- [ ] Core module registered (`registerQuestionType`) with `answerable`,
      `allowedOperators`, `conditionValueKind`, `isAnswered`, `validateAnswer`
- [ ] Renderer template registered (`registerQuestionRenderer`)
- [ ] Editor panel + preview registered (`registerEditorQuestionType`)
- [ ] Backend `QuestionTypeValidator` bean + operator-matrix row
- [ ] Conformance fixtures for any new operators or answer shapes
