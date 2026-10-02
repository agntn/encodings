import { InvalidOptionError } from "./errors.ts";

/**
 * Looks up the codec or digits of the alphabet an `alphabet` option names.
 *
 * @param table - Entries by alphabet name.
 * @param alphabet - The name the caller passed, if any.
 * @param fallback - The name to use when none was passed.
 * @returns {T} The entry.
 */
export function byAlphabet<T>(
  table: Readonly<Record<string, T>>,
  alphabet: string | undefined,
  fallback: string,
): T {
  const name = alphabet ?? fallback;
  if (!Object.hasOwn(table, name)) {
    throw new InvalidOptionError("alphabet", name, `use one of ${Object.keys(table).join(", ")}`);
  }
  return table[name]!;
}
