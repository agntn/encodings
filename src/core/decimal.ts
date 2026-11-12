import { requireBytes, requireText } from "./bytes.ts";
import { DecodeError, EncodingError, InvalidOptionError } from "./errors.ts";
import { checkDigits, createNumbers, NUMBER, type NumbersEncodeOptions } from "./numbers.ts";

/** Options that change what the numbers stand for. */
export interface DecimalOptions {
  /** Each number is a Unicode code point of UTF-8 text, so `380` is `ż`. Default: false. */
  codepoints?: boolean;
}

/** Options for writing decimal numbers. Code points ignore `separate`. */
export interface DecimalEncodeOptions extends NumbersEncodeOptions, DecimalOptions {}

/** Decimal numbers, one per byte or one per code point. */
export interface DecimalCodec {
  /**
   * Writes bytes as decimal numbers.
   *
   * @param bytes - Bytes to write; UTF-8 text with `codepoints`.
   * @param options - Spacing, and whether the numbers are code points.
   * @returns {string} One number per byte or per code point.
   */
  encode(bytes: Uint8Array, options?: Readonly<DecimalEncodeOptions>): string;
  /**
   * Reads decimal numbers as bytes.
   *
   * @param text - Numbers split by whitespace or commas, or runs of three digits per byte.
   * @param options - Whether the numbers are code points.
   * @returns {Uint8Array} The bytes, or the code points as UTF-8.
   */
  decode(text: string, options?: Readonly<DecimalOptions>): Uint8Array;
}

const NAME = "decimal";

const DIGITS = {
  name: NAME,
  radix: 10,
  notDigit: "is not a decimal digit",
  overByte: "for Unicode code points, such as 380 for ż, set codepoints",
} as const;

/** The highest code point Unicode has. */
const MAX_CODE_POINT = 0x10_ff_ff;

const utf8Decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

const utf8Encoder = new TextEncoder();

const bytes = createNumbers(DIGITS);

/**
 * Checks `codepoints`, which callers without types can pass as anything.
 *
 * @param options - Options from the caller.
 * @returns {boolean} Whether the numbers are code points.
 */
function codepointsOf(options: Readonly<DecimalOptions>): boolean {
  const { codepoints = false } = options;
  if (typeof codepoints !== "boolean") {
    throw new InvalidOptionError("codepoints", codepoints, "must be a boolean");
  }
  return codepoints;
}

/**
 * Reads one number as a code point, refusing what no text can hold.
 *
 * @param token - Characters between separators.
 * @param start - Index of the token in the text, for errors.
 * @returns {number} The code point.
 */
function codePointOf(token: string, start: number): number {
  checkDigits(DIGITS, token, start);
  const value = Number(token);
  if (value > MAX_CODE_POINT) {
    throw new DecodeError(NAME, `"${token}" at index ${start} is over 1114111`, start);
  }
  if (value >= 0xd8_00 && value <= 0xdf_ff) {
    throw new DecodeError(
      NAME,
      `"${token}" at index ${start} is a surrogate, not a character`,
      start,
    );
  }
  return value;
}

/**
 * Bytes as decimal numbers from 0 to 255, spaced, as puzzles and ASCII tables write them:
 * `72 105` is `Hi`. Decoding also takes commas, and three digits per byte with no separator.
 * With `codepoints`, each number is a whole character: `90 97 380` is `Zaż`.
 */
export const decimal: DecimalCodec = {
  encode(input, options = {}) {
    requireBytes(`${NAME}: encode`, input);
    if (!codepointsOf(options)) return bytes.encode(input, options);
    let text: string;
    try {
      text = utf8Decoder.decode(input);
    } catch {
      throw new EncodingError(
        `${NAME}: encode with codepoints takes UTF-8 text, and these bytes are not`,
      );
    }
    return Array.from(text, (character) => character.codePointAt(0)).join(" ");
  },
  decode(text, options = {}) {
    requireText(`${NAME}: decode`, text);
    if (!codepointsOf(options)) return bytes.decode(text);
    const characters: string[] = [];
    for (const match of text.matchAll(NUMBER)) {
      characters.push(String.fromCodePoint(codePointOf(match[0], match.index)));
    }
    return utf8Encoder.encode(characters.join(""));
  },
};
