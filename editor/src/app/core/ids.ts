/** Stable internal ids for steps/tabs/questions/options (BRD §5.2). */
export function newId(): string {
  return crypto.randomUUID();
}
