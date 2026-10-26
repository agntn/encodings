import { EncodingError } from "./errors.ts";

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
 * Tells bytes from any other value by their tag, so a `Uint8Array` from another realm counts too.
 *
 * @param value - Any value.
 * @returns {boolean} Whether it is a `Uint8Array` or a subclass such as `Buffer`.
 */
export function isBytes(value: unknown): value is Uint8Array {
  return (
    ArrayBuffer.isView(value) && Object.prototype.toString.call(value) === "[object Uint8Array]"
  );
}

/**
 * Names the type of a caller's value for an error, `null` and arrays included.
 *
 * @param value - Any value.
 * @returns {string} Such as `string`, `null` or `array`.
 */
export function typeName(value: unknown): string {
  if (value === null) return "null";
  return Array.isArray(value) ? "array" : typeof value;
}

/**
 * Refuses anything but bytes, where an untyped string would otherwise encode as zeros.
 *
 * @param where - The codec and operation, such as `hex: encode`.
 * @param value - What the caller passed.
 * @throws {EncodingError} When `value` is not a `Uint8Array`.
 */
export function requireBytes(where: string, value: unknown): asserts value is Uint8Array {
  if (isBytes(value)) return;
  const hint =
    typeof value === "string" ? "; turn the string into bytes first, such as with TextEncoder" : "";
  throw new EncodingError(`${where} takes bytes, got ${typeName(value)}${hint}`);
}

/**
 * Refuses anything but a string from a caller without types.
 *
 * @param where - The codec and operation, such as `hex: decode`.
 * @param value - What the caller passed.
 * @throws {EncodingError} When `value` is not a string.
 */
export function requireText(where: string, value: unknown): asserts value is string {
  if (typeof value !== "string") {
    throw new EncodingError(`${where} takes text, got ${typeName(value)}`);
  }
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
 * Points an error back at the text the caller wrote. Only a throw pays for this walk.
 *
 * @param text - The text as the caller passed it.
 * @param skipped - Source of a pattern for the one-unit characters decoding dropped.
 * @param index - Index in the text without them.
 * @returns {number} The index in `text`.
 */
export function inputIndex(text: string, skipped: string, index: number): number {
  const skip = new RegExp(skipped, "u");
  let kept = 0;
  for (let at = 0; at < text.length; at++) {
    if (skip.test(text[at]!)) continue;
    if (kept === index) return at;
    kept++;
  }
  return text.length;
}

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

/** Code units per `String.fromCodePoint` call, well under any engine's argument cap. */
const CHUNK = 8192;

/** Encoder output in one `Uint16Array`: `out +=` per character costs V8 a rope node each. */
export class TextWriter {
  #units: Uint16Array;
  #length = 0;

  /**
   * @param capacity - Expected length in code units; the buffer doubles past it.
   */
  constructor(capacity: number) {
    this.#units = new Uint16Array(Math.max(capacity, 16));
  }

  /**
   * Appends one character, as two code units when it lies past U+FFFF.
   *
   * @param point - A code point, such as `alphabet.codePointAt(value)`.
   */
  point(point: number): void {
    if (point > 0xffff) {
      this.#unit(0xd800 + ((point - 0x10000) >> 10));
      this.#unit(0xdc00 + ((point - 0x10000) & 0x3ff));
    } else {
      this.#unit(point);
    }
  }

  /**
   * Appends every character of a string.
   *
   * @param text - Text to append.
   */
  text(text: string): void {
    for (let index = 0; index < text.length; index++) {
      const point = text.codePointAt(index)!;
      this.point(point);
      if (point > 0xffff) index++;
    }
  }

  /**
   * The text so far. A lone surrogate is a valid code point, so every unit comes back as written.
   *
   * @returns {string} One string of every code unit, in order.
   */
  toString(): string {
    const parts: string[] = [];
    for (let start = 0; start < this.#length; start += CHUNK) {
      const end = Math.min(start + CHUNK, this.#length);
      parts.push(String.fromCodePoint(...this.#units.subarray(start, end)));
    }
    return parts.join("");
  }

  #unit(unit: number): void {
    if (this.#length === this.#units.length) {
      const units = new Uint16Array(Math.max(this.#units.length * 2, 16));
      units.set(this.#units);
      this.#units = units;
    }
    this.#units[this.#length++] = unit;
  }
}
