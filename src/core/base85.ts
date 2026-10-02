import { alphabetIndex } from "./bytes.ts";
import { DecodeError, named } from "./errors.ts";

/** Options for Ascii85 output. */
export interface Ascii85EncodeOptions {
  /** Wrap the text in Adobe's `<~` and `~>`. Default: false. */
  delimiters?: boolean;
}

/**
 * Writes each four bytes as one 32-bit number in five base-85 digits, most significant first.
 * A short last group is padded with zero bytes and loses as many digits as bytes it lacks.
 *
 * @param bytes - Bytes to write.
 * @param digit - Character for each digit value.
 * @param zeroGroup - Character standing for a whole group of zero bytes, if the variant has one.
 * @returns {string} The text.
 */
function encode85(bytes: Uint8Array, digit: (value: number) => string, zeroGroup?: string): string {
  let out = "";
  for (let index = 0; index < bytes.length; index += 4) {
    const length = Math.min(4, bytes.length - index);
    let value = 0;
    for (let byte = 0; byte < 4; byte++) value = value * 256 + (bytes[index + byte] ?? 0);
    if (zeroGroup !== undefined && length === 4 && value === 0) {
      out += zeroGroup;
      continue;
    }
    const group: string[] = [];
    for (let place = 0; place < 5; place++) {
      group.unshift(digit(value % 85));
      value = Math.floor(value / 85);
    }
    out += group.slice(0, length + 1).join("");
  }
  return out;
}

/**
 * Reads base-85 digit values back into bytes, five per four, with a short last group padded by
 * the highest digit.
 *
 * @param name - Registry name, for errors.
 * @param values - Digit values in order.
 * @returns {Uint8Array} The bytes.
 */
function decode85(name: string, values: readonly number[]): Uint8Array {
  if (values.length % 5 === 1) {
    throw new DecodeError(name, `${values.length} digits leave a group of one`);
  }
  const out: number[] = [];
  for (let index = 0; index < values.length; index += 5) {
    const length = Math.min(5, values.length - index);
    let value = 0;
    for (let place = 0; place < 5; place++) value = value * 85 + (values[index + place] ?? 84);
    if (value > 0xffffffff) {
      throw new DecodeError(name, `group at digit ${index} is over 2^32 - 1`);
    }
    for (let byte = 0; byte < length - 1; byte++) out.push((value >>> (24 - byte * 8)) & 0xff);
  }
  return Uint8Array.from(out);
}

/** ASCII whitespace, which Ascii85 decoders skip anywhere. */
const WHITESPACE = new Set(["\t", "\n", "\f", "\r", " "]);

/**
 * Strips Adobe's `<~` and `~>` from Ascii85 text, or the `~>` alone, which btoa writes.
 *
 * @param text - Ascii85 text.
 * @returns {string} The digits.
 */
function withoutDelimiters(text: string): string {
  const body = text.trim();
  if (body.startsWith("<~")) {
    if (!body.endsWith("~>")) throw new DecodeError("ascii85", "`<~` without a closing `~>`");
    return body.slice(2, -2);
  }
  return body.endsWith("~>") ? body.slice(0, -2) : body;
}

/**
 * Reads one Ascii85 character as digit values: `z` as five zeros, `!` to `u` as 0 to 84.
 *
 * @param character - The character.
 * @param index - Its index, for errors.
 * @param groupStart - Whether a group starts here, the only place `z` may stand.
 * @returns {number[]} The digits.
 */
function ascii85Digits(character: string, index: number, groupStart: boolean): number[] {
  const code = character.codePointAt(0)!;
  if (character === "z") {
    if (!groupStart)
      throw new DecodeError("ascii85", `"z" at index ${index} inside a group`, index);
    return [0, 0, 0, 0, 0];
  }
  if (code >= 33 && code <= 117) return [code - 33];
  throw new DecodeError(
    "ascii85",
    `${named(character)} at index ${index} is not an Ascii85 digit`,
    index,
  );
}

/**
 * Ascii85 (btoa, PostScript and PDF): `!` to `u`, with `z` for four zero bytes. Decoding takes
 * the text with or without Adobe's `<~` `~>` and skips ASCII whitespace. The btoa `y`
 * abbreviation for four spaces is not read, as Adobe's version has none.
 */
export const ascii85 = {
  /**
   * Writes bytes in Ascii85.
   *
   * @param bytes - Bytes to write.
   * @param options - Whether to add Adobe's delimiters.
   * @returns {string} The text.
   */
  encode(bytes: Uint8Array, options: Readonly<Ascii85EncodeOptions> = {}): string {
    const body = encode85(bytes, (value) => String.fromCodePoint(33 + value), "z");
    return options.delimiters ? `<~${body}~>` : body;
  },

  /**
   * Reads Ascii85 text.
   *
   * @param text - Ascii85 text, optionally between `<~` and `~>`.
   * @returns {Uint8Array} The bytes.
   */
  decode(text: string): Uint8Array {
    const values: number[] = [];
    let index = 0;
    for (const character of withoutDelimiters(text)) {
      if (!WHITESPACE.has(character)) {
        values.push(...ascii85Digits(character, index, values.length % 5 === 0));
      }
      index += character.length;
    }
    return decode85("ascii85", values);
  },
} as const;

const Z85_ALPHABET =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.-:+=^!/*?&<>()[]{}@%$#";
const Z85_VALUES = alphabetIndex(Z85_ALPHABET);

/**
 * Z85 (ZeroMQ RFC 32): base 85 with an alphabet safe in source code and XML. The spec covers
 * only whole groups, so encoding takes a multiple of four bytes and decoding a multiple of five
 * characters.
 */
export const z85 = {
  /**
   * Writes bytes in Z85.
   *
   * @param bytes - A multiple of four bytes.
   * @returns {string} Five characters per four bytes.
   */
  encode(bytes: Uint8Array): string {
    if (bytes.length % 4 !== 0) {
      throw new RangeError(`z85: ${bytes.length} bytes are not a multiple of 4`);
    }
    return encode85(bytes, (value) => Z85_ALPHABET[value]!);
  },

  /**
   * Reads Z85 text.
   *
   * @param text - A multiple of five Z85 characters.
   * @returns {Uint8Array} The bytes.
   */
  decode(text: string): Uint8Array {
    const values: number[] = [];
    let index = 0;
    for (const character of text) {
      const value = Z85_VALUES.get(character);
      if (value === undefined) {
        throw new DecodeError(
          "z85",
          `${named(character)} at index ${index} is not in the alphabet`,
          index,
        );
      }
      values.push(value);
      index += character.length;
    }
    if (values.length % 5 !== 0) {
      throw new DecodeError("z85", `${values.length} characters are not a multiple of 5`);
    }
    return decode85("z85", values);
  },
} as const;
