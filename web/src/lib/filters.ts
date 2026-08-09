/**
 * Rows are marked, not removed, so an offline client can still learn that
 * something disappeared. Every list query has to exclude them explicitly.
 *
 * `!= true` rather than `= false` on purpose: rows written before the field
 * existed store null, and null is not false in a PocketBase filter.
 */
export const ALIVE = "deleted != true";

/** Combines ALIVE with extra conditions, skipping empty ones. */
export function alive(...conditions: (string | false | null | undefined)[]): string {
  return [ALIVE, ...conditions.filter(Boolean)].join(" && ");
}
