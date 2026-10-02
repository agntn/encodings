import { ASCII_WHITESPACE } from "./bytes.ts";
import { radix2, type Radix2Codec } from "./radix2.ts";

const LETTERS_AND_DIGITS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/**
 * Base64 (RFC 4648 §4): letters, digits, `+` and `/`, padded with `=` to blocks of four.
 * Decoding takes the text with or without padding and skips ASCII whitespace, so MIME's
 * 76-character lines read as one.
 */
export const base64: Radix2Codec = radix2({
  name: "base64",
  alphabet: `${LETTERS_AND_DIGITS}+/`,
  padding: true,
  ignore: ASCII_WHITESPACE,
});

/**
 * Base64 with the URL and filename safe alphabet (RFC 4648 §5): `-` and `_` in place of `+`
 * and `/`. Unpadded, as JWT and most URL uses write it; decoding also takes the padding.
 */
export const base64url: Radix2Codec = radix2({
  name: "base64url",
  alphabet: `${LETTERS_AND_DIGITS}-_`,
  padding: false,
  ignore: ASCII_WHITESPACE,
});
