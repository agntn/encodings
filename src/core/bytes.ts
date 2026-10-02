/** Text or bytes to encode. A string is read as UTF-8. */
export type BytesInput = string | Uint8Array;

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

/**
 * Turns the caller's input into bytes: a string as its UTF-8, bytes as they are.
 *
 * @param input - Text or bytes.
 * @returns {Uint8Array} The bytes to encode.
 */
export function toBytes(input: BytesInput): Uint8Array {
  return typeof input === "string" ? utf8Encoder.encode(input) : input;
}

/**
 * Reads bytes as UTF-8 text, or nothing when they are not valid UTF-8.
 *
 * @param bytes - Decoded bytes.
 * @returns {string | undefined} The text, or `undefined` for invalid UTF-8.
 */
export function utf8(bytes: Uint8Array): string | undefined {
  try {
    return utf8Decoder.decode(bytes);
  } catch {
    return undefined;
  }
}

/**
 * Joins byte arrays.
 *
 * @param parts - The arrays in order.
 * @returns {Uint8Array} One array holding all of them.
 */
export function concat(...parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/**
 * Compares two byte arrays.
 *
 * @param left - First array.
 * @param right - Second array.
 * @returns {boolean} Whether both hold the same bytes.
 */
export function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

/** ASCII whitespace that wrapped encodings (MIME base64, hex dumps) put between characters. */
export const ASCII_WHITESPACE = /[\t\n\f\r ]/gu;

/**
 * Maps each character of an alphabet to its value, for decoding.
 *
 * @param alphabet - ASCII characters in value order.
 * @returns {Map<string, number>} Value by character.
 */
export function alphabetIndex(alphabet: string): Map<string, number> {
  return new Map(alphabet.split("").map((character, value) => [character, value] as const));
}

/** Code points in the longest symbol a table of symbols takes; emoji sequences run to about ten. */
export const MAX_SYMBOL = 16;

/**
 * Splits text into graphemes, so an emoji with its variation selector stays one symbol.
 *
 * @param text - Any text.
 * @returns {Intl.Segments} The graphemes with their index.
 */
export function graphemes(text: string): Intl.Segments {
  return new Intl.Segmenter("en", { granularity: "grapheme" }).segment(text);
}
