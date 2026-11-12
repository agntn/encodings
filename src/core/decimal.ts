import { requireBytes, requireText } from "./bytes.ts";
import { codepointsOf, createCodePoints, type CodePointsOptions } from "./codepoints.ts";
import { checkDigits, createNumbers, type NumbersEncodeOptions } from "./numbers.ts";

/** Options that change what the numbers stand for. */
export type DecimalOptions = CodePointsOptions;

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

const bytes = createNumbers(DIGITS);

const codePoints = createCodePoints({
  name: NAME,
  max: "1114111",
  read(token, start) {
    checkDigits(DIGITS, token, start);
    return Number(token);
  },
  write: String,
});

/**
 * Bytes as decimal numbers from 0 to 255, spaced, as puzzles and ASCII tables write them:
 * `72 105` is `Hi`. Decoding also takes commas, and three digits per byte with no separator.
 * With `codepoints`, each number is a whole character: `90 97 380` is `Zaż`.
 */
export const decimal: DecimalCodec = {
  encode(input, options = {}) {
    requireBytes(`${NAME}: encode`, input);
    return codepointsOf(options) ? codePoints.encode(input) : bytes.encode(input, options);
  },
  decode(text, options = {}) {
    requireText(`${NAME}: decode`, text);
    return codepointsOf(options) ? codePoints.decode(text) : bytes.decode(text);
  },
};
