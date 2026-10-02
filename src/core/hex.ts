import { ASCII_WHITESPACE } from "./bytes.ts";
import { DecodeError, named } from "./errors.ts";

/** Options for hex output. */
export interface HexEncodeOptions {
  /** Write `A` to `F` instead of `a` to `f`. Default: false. */
  upper?: boolean;
}

const LOWER = "0123456789abcdef";
const UPPER = "0123456789ABCDEF";

/** Value of each hex digit by its character code; -1 for anything else. */
const DIGITS = new Int8Array(128).fill(-1);
for (let value = 0; value < 16; value++) {
  DIGITS[LOWER.codePointAt(value)!] = value;
  DIGITS[UPPER.codePointAt(value)!] = value;
}

/**
 * Base16 (RFC 4648 §8): two hex digits per byte. Decoding takes either case, skips ASCII
 * whitespace, as in a hex dump, and drops one leading `0x`.
 */
export const hex = {
  /**
   * Writes bytes as hex digits.
   *
   * @param bytes - Bytes to write.
   * @param options - Letter case.
   * @returns {string} Two digits per byte.
   */
  encode(bytes: Uint8Array, options: Readonly<HexEncodeOptions> = {}): string {
    const digits = options.upper ? UPPER : LOWER;
    let out = "";
    for (const byte of bytes) out += digits[byte >> 4]! + digits[byte & 15]!;
    return out;
  },

  /**
   * Reads hex digits as bytes.
   *
   * @param text - Hex text, optionally `0x`-prefixed and spaced.
   * @returns {Uint8Array} The bytes.
   */
  decode(text: string): Uint8Array {
    let body = text.replaceAll(ASCII_WHITESPACE, "");
    if (/^0x/iu.test(body)) body = body.slice(2);
    if (body.length % 2 !== 0) {
      throw new DecodeError("hex", `odd number of digits (${body.length})`);
    }
    const out = new Uint8Array(body.length / 2);
    for (let index = 0; index < body.length; index++) {
      const code = body.codePointAt(index)!;
      const value = code < 128 ? DIGITS[code]! : -1;
      if (value === -1) {
        const character = String.fromCodePoint(code);
        throw new DecodeError("hex", `${named(character)} is not a hex digit`, index);
      }
      out[index >> 1] = index % 2 === 0 ? value << 4 : out[index >> 1]! | value;
    }
    return out;
  },
} as const;
