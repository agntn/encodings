import { ASCII_WHITESPACE } from "./bytes.ts";
import { radix2 } from "./radix2.ts";

const LETTERS_AND_DIGITS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** Options for reading and writing base64. */
export interface Base64Options {
  /** Use the URL alphabet of RFC 4648 §5, `-` and `_` for `+` and `/`. Default: false. */
  url?: boolean;
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

const STANDARD = radix2({
  name: "base64",
  alphabet: `${LETTERS_AND_DIGITS}+/`,
  padding: true,
  ignore: ASCII_WHITESPACE,
});

const URL_SAFE = radix2({
  name: "base64",
  alphabet: `${LETTERS_AND_DIGITS}-_`,
  padding: true,
  ignore: ASCII_WHITESPACE,
});

/**
 * Base64 (RFC 4648 §4): letters, digits, `+` and `/`, padded with `=` to blocks of four. `url`
 * switches to `-` and `_`, and JWT also sets `padding` false. Decoding skips whitespace.
 */
export const base64: Base64Codec = {
  encode: (bytes, options = {}) =>
    (options.url ? URL_SAFE : STANDARD).encode(bytes, { padding: options.padding ?? true }),
  decode: (text, options = {}) => (options.url ? URL_SAFE : STANDARD).decode(text),
};
