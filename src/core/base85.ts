import { alphabetIndex } from "./bytes.ts";
import { byAlphabet } from "./alphabets.ts";
import { DecodeError, EncodingError, InvalidOptionError, named } from "./errors.ts";

/** The base85 alphabets, in the order `info().options` lists them. */
export const BASE85_ALPHABETS = ["rfc1924", "ascii85", "z85"] as const;

/** A base85 alphabet: RFC 1924's, Adobe's Ascii85 or ZeroMQ's Z85. */
export type Base85Alphabet = (typeof BASE85_ALPHABETS)[number];

/** Options for reading and writing base85. */
export interface Base85Options {
  /** Alphabet to use. Default: `rfc1924`. */
  alphabet?: Base85Alphabet;
}

/** Options for base85 output. */
export interface Base85EncodeOptions extends Base85Options {
  /** Wrap the text in Adobe's `<~` and `~>`. Only Ascii85 has them. Default: false. */
  delimiters?: boolean;
}

/** Base85 in any of its three alphabets. */
export interface Base85Codec {
  encode(bytes: Uint8Array, options?: Readonly<Base85EncodeOptions>): string;
  decode(text: string, options?: Readonly<Base85Options>): Uint8Array;
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

/**
 * Reads each character of a text as its digit value in an alphabet with no whitespace or
 * framing to skip.
 *
 * @param name - Registry name, for errors.
 * @param text - The text.
 * @param value - Digit value of a character, or nothing when it is not in the alphabet.
 * @returns {number[]} Digit values in order.
 */
function alphabetDigits(
  name: string,
  text: string,
  value: (character: string) => number | undefined,
): number[] {
  const values: number[] = [];
  let index = 0;
  for (const character of text) {
    const digit = value(character);
    if (digit === undefined) {
      throw new DecodeError(
        name,
        `${named(character)} at index ${index} is not in the alphabet`,
        index,
      );
    }
    values.push(digit);
    index += character.length;
  }
  return values;
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
    if (!body.endsWith("~>")) throw new DecodeError("base85", "`<~` without a closing `~>`");
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
    if (!groupStart) throw new DecodeError("base85", `"z" at index ${index} inside a group`, index);
    return [0, 0, 0, 0, 0];
  }
  if (code >= 33 && code <= 117) return [code - 33];
  throw new DecodeError(
    "base85",
    `${named(character)} at index ${index} is not an Ascii85 digit`,
    index,
  );
}

/** One alphabet: how it writes bytes and reads them back. */
interface Variant {
  encode(bytes: Uint8Array): string;
  decode(text: string): Uint8Array;
}

/**
 * Reads Ascii85 text: with or without Adobe's `<~` `~>`, skipping ASCII whitespace.
 *
 * @param text - Ascii85 text.
 * @returns {Uint8Array} The bytes.
 */
function decodeAscii85(text: string): Uint8Array {
  const values: number[] = [];
  let index = 0;
  for (const character of withoutDelimiters(text)) {
    if (!WHITESPACE.has(character)) {
      values.push(...ascii85Digits(character, index, values.length % 5 === 0));
    }
    index += character.length;
  }
  return decode85("base85", values);
}

const Z85_ALPHABET =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.-:+=^!/*?&<>()[]{}@%$#";
const Z85_VALUES = alphabetIndex(Z85_ALPHABET);

const RFC1924_ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!#$%&()*+-;<=>?@^_`{|}~";
const RFC1924_VALUES = alphabetIndex(RFC1924_ALPHABET);

const VARIANTS: Readonly<Record<Base85Alphabet, Variant>> = {
  rfc1924: {
    encode: (bytes) => encode85(bytes, (value) => RFC1924_ALPHABET[value]!),
    decode: (text) =>
      decode85(
        "base85",
        alphabetDigits("base85", text, (character) => RFC1924_VALUES.get(character)),
      ),
  },
  ascii85: {
    encode: (bytes) => encode85(bytes, (value) => String.fromCodePoint(33 + value), "z"),
    decode: decodeAscii85,
  },
  z85: {
    encode(bytes) {
      if (bytes.length % 4 !== 0) {
        throw new EncodingError(
          `base85: ${bytes.length} bytes are not a multiple of 4, as Z85 needs`,
        );
      }
      return encode85(bytes, (value) => Z85_ALPHABET[value]!);
    },
    decode(text) {
      const values = alphabetDigits("base85", text, (character) => Z85_VALUES.get(character));
      if (values.length % 5 !== 0) {
        throw new DecodeError("base85", `${values.length} characters are not a multiple of 5`);
      }
      return decode85("base85", values);
    },
  },
};

/**
 * Base85: each four bytes as five base-85 digits, most significant first. The alphabets:
 *
 * - `rfc1924` (default): RFC 1924's, in groups of four bytes as git binary patches and
 *   Python's `b85encode` write it. RFC 1924 itself reads a whole IPv6 address as one number;
 *   this reads any length, with a short last group cut short.
 * - `ascii85`: btoa, PostScript and PDF. `!` to `u`, with `z` for four zero bytes. Decoding
 *   takes the text with or without Adobe's `<~` `~>` and skips ASCII whitespace. The btoa `y`
 *   for four spaces is not read, as Adobe's version has none.
 * - `z85`: ZeroMQ RFC 32, safe in a string literal of source code (no quote or backslash) but
 *   not in XML, which `<` and `&` break. The spec covers only whole groups, so encoding takes a
 *   multiple of four bytes and decoding a multiple of five characters.
 */
export const base85: Base85Codec = {
  encode(bytes, options = {}) {
    const alphabet = options.alphabet ?? "rfc1924";
    const text = byAlphabet(VARIANTS, alphabet, "rfc1924").encode(bytes);
    if (options.delimiters !== true) return text;
    if (alphabet !== "ascii85") {
      throw new InvalidOptionError("delimiters", true, "only the ascii85 alphabet has them");
    }
    return `<~${text}~>`;
  },
  decode: (text, options = {}) => byAlphabet(VARIANTS, options.alphabet, "rfc1924").decode(text),
};
