/**
 * Pure helpers for the responses browser (Phase 4 FR4-10). The table's
 * answered-question and file counts derive from the flat answers map alone —
 * file references in answers are the FR3-9 convenience copies, so no extra
 * endpoint is needed.
 */

/** A stored FILE_UPLOAD answer element (Phase 3 FR3-9 reference object). */
function isFileReference(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { fileId?: unknown }).fileId === 'string' &&
    typeof (value as { fileName?: unknown }).fileName === 'string'
  );
}

/** Number of answered questions = keys in the flat map (unanswered = absent). */
export function answeredCount(answers: Record<string, unknown>): number {
  return Object.keys(answers).length;
}

/** Total uploaded files referenced by this response's answers. */
export function fileCount(answers: Record<string, unknown>): number {
  let count = 0;
  for (const value of Object.values(answers)) {
    if (Array.isArray(value)) {
      count += value.filter(isFileReference).length;
    }
  }
  return count;
}

/** Pretty-printed answers JSON for the row expansion. */
export function prettyAnswers(answers: Record<string, unknown>): string {
  return JSON.stringify(answers, null, 2);
}
