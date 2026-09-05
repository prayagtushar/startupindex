/**
 * Namespaced localStorage.
 *
 * The app shipped under the name ISRA and stored everything under `isra-*`.
 * Renaming the keys outright would have silently dropped every existing
 * visitor's conversations, theme and settings, so a read falls back to the old
 * key once and the next write moves the value across.
 */

const PREFIX = "startupindex:";
const LEGACY_PREFIX = "isra-";

export function readStored(key: string): string | null {
  try {
    const current = localStorage.getItem(PREFIX + key);
    if (current !== null) return current;

    const legacy = localStorage.getItem(LEGACY_PREFIX + key);
    if (legacy !== null) {
      // Carry it over on first read so the fallback is only ever paid once.
      localStorage.setItem(PREFIX + key, legacy);
      localStorage.removeItem(LEGACY_PREFIX + key);
    }
    return legacy;
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(PREFIX + key, value);
  } catch {
    // Private browsing, or storage is full. The app works without persistence.
  }
}

export function removeStored(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
    localStorage.removeItem(LEGACY_PREFIX + key);
  } catch {
    // As above.
  }
}

/** The same read, inlined into the pre-paint theme script. */
export const storageBootstrapSnippet = `function(k){try{var v=localStorage.getItem('${PREFIX}'+k);if(v!==null)return v;var l=localStorage.getItem('${LEGACY_PREFIX}'+k);if(l!==null){localStorage.setItem('${PREFIX}'+k,l);localStorage.removeItem('${LEGACY_PREFIX}'+k);}return l;}catch(e){return null;}}`;
