/** One contract for every tool surface; the schemas repeat it, the executors enforce it. */

/** Longest text a tool reads or writes, in characters. */
export const MAX_TEXT_LENGTH = 100_000;

/** Longest encoding or family name a tool takes. */
export const MAX_NAME_LENGTH = 40;

/** Longest bech32 prefix, from BIP173. */
export const MAX_PREFIX_LENGTH = 83;

/**
 * Longest base58 text or input a tool takes. Base58 is quadratic in the length, and real
 * base58 strings (addresses, keys, CIDs) are under 200 characters.
 */
export const MAX_BASE58_LENGTH = 10_000;

/** Most candidates `encodings_identify` returns. */
export const MAX_CANDIDATES = 20;

/** How a tool reads the text it encodes: as UTF-8, or as the bytes its hex or base64 spells. */
export const INPUT_FORMATS = ["utf8", "hex", "base64"] as const;

/** How a tool writes decoded bytes: `auto` picks UTF-8 for readable text and hex otherwise. */
export const OUTPUT_FORMATS = ["auto", "utf8", "hex", "base64"] as const;

export type InputFormat = (typeof INPUT_FORMATS)[number];
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];
