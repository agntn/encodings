import { ASCII_WHITESPACE, TextWriter, inputIndex, requireBytes, requireText } from "./bytes.ts";
import { codepointsOf, createCodePoints, type CodePointsOptions } from "./codepoints.ts";
import { DecodeError, named } from "./errors.ts";

/** Options that change what the digits stand for. */
export type HexOptions = CodePointsOptions;

/** Options for hex output. Code points always come out as `U+017C`. */
export interface HexEncodeOptions extends HexOptions {
  /** Write `A` to `F` instead of `a` to `f`. Default: false. */
  upper?: boolean;
}

/** Hex digits, two per byte or one `U+` number per code point. */
export interface HexCodec {
  /**
   * Writes bytes as hex digits.
   *
   * @param bytes - Bytes to write; UTF-8 text with `codepoints`.
   * @param options - Letter case, and whether to write code points.
   * @returns {string} Two digits per byte, or `U+` and at least four digits per code point.
   */
  encode(bytes: Uint8Array, options?: Readonly<HexEncodeOptions>): string;
  /**
   * Reads hex digits as bytes.
   *
   * @param text - Hex digits, or code points with an optional `U+`.
   * @param options - Whether the numbers are code points.
   * @returns {Uint8Array} The bytes, or the code points as UTF-8.
   */
  decode(text: string, options?: Readonly<HexOptions>): Uint8Array;
}

const NAME = "hex";

const LOWER = "0123456789abcdef";
const UPPER = "0123456789ABCDEF";

/** Value of each hex digit by its character code; -1 for anything else. */
const DIGITS = new Int8Array(128).fill(-1);
for (let value = 0; value < 16; value++) {
  DIGITS[LOWER.codePointAt(value)!] = value;
  DIGITS[UPPER.codePointAt(value)!] = value;
}

/** Where a stray character sits, and what else the text could be. */
interface Stray {
  character: string;
  at: number;
  hint?: string;
}

/**
 * The error for a character that is not a hex digit.
 *
 * @param stray - The character, its index and a hint.
 * @returns {DecodeError} The error to throw.
 */
function notDigit(stray: Readonly<Stray>): DecodeError {
  const hint = stray.hint === undefined ? "" : `; ${stray.hint}`;
  return new DecodeError(
    NAME,
    `${named(stray.character)} at index ${stray.at} is not a hex digit${hint}`,
    stray.at,
  );
}

/**
 * The value of a hex digit.
 *
 * @param character - One code point.
 * @returns {number} 0 to 15, or -1 when it is not a digit.
 */
function digitOf(character: string): number {
  const code = character.codePointAt(0)!;
  return code < 128 ? DIGITS[code]! : -1;
}

const codePoints = createCodePoints({
  name: NAME,
  max: "U+10FFFF",
  read(token, start) {
    const prefix = /^u\+/iu.test(token) ? 2 : 0;
    if (prefix === token.length) {
      throw new DecodeError(NAME, `"${token}" at index ${start} has no digits`, start);
    }
    let at = start + prefix;
    for (const character of token.slice(prefix)) {
      if (digitOf(character) === -1) throw notDigit({ character, at });
      at += character.length;
    }
    return Number.parseInt(token.slice(prefix), 16);
  },
  write: (point) => `U+${point.toString(16).toUpperCase().padStart(4, "0")}`,
});

/** Points `U+017C` in byte mode at the option that reads it. */
const CODE_POINT_HINT = "for Unicode code points, such as U+017C for ż, set codepoints";

/**
 * Reads hex digits as bytes.
 *
 * @param text - Hex text, optionally `0x`-prefixed and spaced.
 * @returns {Uint8Array} The bytes.
 */
function decodeBytes(text: string): Uint8Array {
  let body = text.replaceAll(ASCII_WHITESPACE, "");
  const prefix = /^0x/iu.test(body) ? 2 : 0;
  body = body.slice(prefix);
  const out = new Uint8Array(body.length >> 1);
  for (let index = 0; index < body.length; index++) {
    const character = String.fromCodePoint(body.codePointAt(index)!);
    const value = digitOf(character);
    if (value === -1) {
      const at = inputIndex(text, ASCII_WHITESPACE.source, prefix + index);
      const hint = /^u\+/iu.test(body.slice(index)) ? CODE_POINT_HINT : undefined;
      throw notDigit({ character, at, hint });
    }
    out[index >> 1] = index % 2 === 0 ? value << 4 : out[index >> 1]! | value;
  }
  if (body.length % 2 !== 0) {
    throw new DecodeError(NAME, `odd number of digits (${body.length})`);
  }
  return out;
}

/**
 * Base16 (RFC 4648 §8): two hex digits per byte. Decoding takes either case, skips ASCII
 * whitespace, as in a hex dump, and drops one leading `0x`. With `codepoints`, each number
 * is a whole character, as Unicode charts write them: `U+005A U+0061 U+017C` is `Zaż`.
 */
export const hex: HexCodec = {
  encode(bytes, options = {}) {
    requireBytes(`${NAME}: encode`, bytes);
    if (codepointsOf(options)) return codePoints.encode(bytes);
    const digits = options.upper ? UPPER : LOWER;
    const out = new TextWriter(bytes.length * 2);
    for (const byte of bytes) {
      out.point(digits.codePointAt(byte >> 4)!);
      out.point(digits.codePointAt(byte & 15)!);
    }
    return out.toString();
  },
  decode(text, options = {}) {
    requireText(`${NAME}: decode`, text);
    return codepointsOf(options) ? codePoints.decode(text) : decodeBytes(text);
  },
};
