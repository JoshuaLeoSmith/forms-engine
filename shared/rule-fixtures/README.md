# Rule-engine conformance fixtures (BRD §6.6, Phase 2 FR2-8)

Each `*.json` file is one test case:

```jsonc
{
  "name": "unique-name",
  "description": "what semantic this pins down",
  "definitionFragment": { /* a full definition document, §5.2 */ },
  "answers": { "<code>": <value> },           // typed values (Phase 2 §3):
                                              // string | number | boolean |
                                              // string[] | flat string object
  "expected": {
    "visibleQuestionCodes": ["..."],          // effectively visible after the fixpoint loop
    "requiredQuestionCodes": ["..."],         // effectively required (subset of visible)
    "clearedCodes": ["..."],                  // answers removed by the clearing loop
    "capHit": false                           // optional; defaults to false
  }
}
```

`p2-*` fixtures pin the Phase-2 semantics (§4.3): typed EQUALS (0-valued
numbers, false toggles), `CONTAINS`/`NOT_CONTAINS`, strict `GREATER_THAN`/
`LESS_THAN`, strict `BEFORE`/`AFTER` (ISO string comparison), ADDRESS
`subField` targeting (empty sub-field = unanswered), clearing cascades through
every new operator, and the registry-driven gating exclusions (unknown types
and codeless DISPLAY_BLOCK entries are never required).

Harness contract (must match in every implementation):

1. Normalize `definitionFragment` (§5.1 — synthetic containers).
2. Run the full evaluation: visibility + clearing fixpoint loop (§6.7, cap 25),
   then effective requirement (§6.4).
3. Compare the three code lists **as sets** (order-insensitive) and `capHit`.

The TypeScript suite lives at `packages/renderer/test/fixtures.test.ts`. A
future Java implementation must load and pass these same files (NFR-7).
