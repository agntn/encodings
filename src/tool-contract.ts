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

/** Longest `symbols` or `digits` option: two binary symbols, a base256 table, integer digits. */
export const MAX_SYMBOLS_LENGTH = 4096;

/** Most candidates `encodings_identify` returns. */
export const MAX_CANDIDATES = 20;

/** How a tool reads the text it encodes: as UTF-8, or as the bytes its hex or base64 spells. */
export const INPUT_FORMATS = ["utf8", "hex", "base64"] as const;

/** How a tool writes decoded bytes: `auto` picks UTF-8 for readable text and hex otherwise. */
export const OUTPUT_FORMATS = ["auto", "utf8", "hex", "base64"] as const;

/**
 * Every value the `alphabet` option takes, in every family that has one. A literal list, so the
 * schemas load without the codecs; `test/mcp.test.ts` holds it to the registry.
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
  "ita2",
  "ita1",
  "us-tty",
] as const;

/** The built-in codes of `prefix`, as `test/mcp.test.ts` holds them to `PREFIX_CODES`. */
export const CODES = ["truncated", "unary", "gamma"] as const;

/** Most symbols of truncated binary, as the codec caps it. */
export const MAX_TRUNCATED_SYMBOLS = 2 ** 32;

/**
 * What `encodings_charset_convert` reads and writes: UTF-8, hex, base64 or a code page. A literal
 * list, so the schemas load without the tables; `test/mcp.test.ts` holds it to `CODE_PAGES`.
 */
export const CHARSET_FORMATS = [
  "utf8",
  "hex",
  "base64",
  "ibm037",
  "ibm273",
  "ibm500",
  "ibm1140",
  "ibm1141",
  "ibm437",
  "latin1",
  "windows1252",
] as const;

export type InputFormat = (typeof INPUT_FORMATS)[number];
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];
export type CharsetFormat = (typeof CHARSET_FORMATS)[number];
