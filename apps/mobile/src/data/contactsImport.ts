/**
 * Turning phone contacts into people, with as little data as possible: only
 * display names ever reach this module (no numbers, emails, photos or contact
 * ids), and only the names the user ticks are stored. Pure, so it is tested.
 */

export interface Candidate {
  name: string;
  /** Someone with this name is already in the user's network. */
  alreadyAdded: boolean;
}

/** Comparison key: case- and spacing-insensitive. */
export function nameKey(name: string): string {
  return name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

/** Contacts saved as just a number or symbol are not useful as people. */
function looksLikeAName(name: string): boolean {
  return /\p{L}/u.test(name);
}

/**
 * The list to choose from: tidied, without duplicates (phones often hold the
 * same person several times), without nameless entries, sorted, and with
 * people already in the network marked so they are not imported twice.
 */
export function contactCandidates(contactNames: string[], existingNames: string[]): Candidate[] {
  const existing = new Set(existingNames.map(nameKey));
  const seen = new Map<string, string>();
  for (const raw of contactNames) {
    const name = raw.normalize('NFKC').trim().replace(/\s+/g, ' ');
    if (!name || !looksLikeAName(name)) continue;
    const key = nameKey(name);
    if (!seen.has(key)) seen.set(key, name);
  }
  return [...seen.entries()]
    .map(([key, name]) => ({ name, alreadyAdded: existing.has(key) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Case-insensitive search over candidates. */
export function filterCandidates(candidates: Candidate[], query: string): Candidate[] {
  const q = nameKey(query);
  return q ? candidates.filter((c) => nameKey(c.name).includes(q)) : candidates;
}
