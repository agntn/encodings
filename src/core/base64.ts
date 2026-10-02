import { byAlphabet } from "./alphabets.ts";
import { ASCII_WHITESPACE } from "./bytes.ts";
import { radix2, type PaddedCodec } from "./radix2.ts";

const LETTERS_AND_DIGITS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** The base64 alphabets, in the order `info().options` lists them. */
export const BASE64_ALPHABETS = ["standard", "url"] as const;

/** A base64 alphabet: RFC 4648 §4 (`standard`) or §5 (`url`). */
export type Base64Alphabet = (typeof BASE64_ALPHABETS)[number];

/** Options for reading and writing base64. */
export interface Base64Options {
  /** Alphabet to use. Default: `standard`. */
  alphabet?: Base64Alphabet;
}

/** Options for base64 output. */
export interface Base64EncodeOptions extends Base64Options {
  /** Pad the last block with `=` to four characters. Default: true. */
  padding?: boolean;
}

/** RFC 4648 base64 in either of its two alphabets. */
export interface Base64Codec {
  encode(bytes: Uint8Array, options?: Readonly<Base64EncodeOptions>): string;
  decode(text: string, options?: Readonly<Base64Options>): Uint8Array;
}

const CODECS: Readonly<Record<Base64Alphabet, PaddedCodec>> = {
  standard: radix2({
    name: "base64",
    alphabet: `${LETTERS_AND_DIGITS}+/`,
    padding: true,
    ignore: ASCII_WHITESPACE,
  }),
  url: radix2({
    name: "base64",
    alphabet: `${LETTERS_AND_DIGITS}-_`,
    padding: true,
    ignore: ASCII_WHITESPACE,
  }),
};

/**
 * Base64 (RFC 4648 §4): letters, digits, `+` and `/`, padded with `=` to blocks of four. The
 * `url` alphabet writes `-` and `_` instead, and JWT also sets `padding` false. Decoding skips
 * whitespace.
 */
export const base64: Base64Codec = {
  encode: (bytes, options = {}) =>
    byAlphabet(CODECS, options.alphabet, "standard").encode(bytes, {
      padding: options.padding ?? true,
    }),
  decode: (text, options = {}) => byAlphabet(CODECS, options.alphabet, "standard").decode(text),
};
