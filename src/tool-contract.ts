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

/** Longest `symbols` option: two binary symbols, or a base256 table of up to 256. */
export const MAX_SYMBOLS_LENGTH = 4096;

/** Most candidates `encodings_identify` returns. */
export const MAX_CANDIDATES = 20;

/** How a tool reads the text it encodes: as UTF-8, or as the bytes its hex or base64 spells. */
export const INPUT_FORMATS = ["utf8", "hex", "base64"] as const;

/** How a tool writes decoded bytes: `auto` picks UTF-8 for readable text and hex otherwise. */
export const OUTPUT_FORMATS = ["auto", "utf8", "hex", "base64"] as const;

/**
 * Every value the `alphabet` option takes, across base32, base58, base64, base85 and base256. A
 * literal list, so the schemas load without the codecs; `test/mcp.test.ts` holds it to the registry.
 */
export const ALPHABETS = [
  "standard",
  "hex",
  "crockford",
  "z",
  "bitcoin",
  "flickr",
  "ripple",
  "url",
  "rfc1924",
  "ascii85",
  "z85",
  "emoji",
] as const;

export type InputFormat = (typeof INPUT_FORMATS)[number];
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];
