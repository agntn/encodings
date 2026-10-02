import { ASCII_WHITESPACE } from "./bytes.ts";
import { radix2, type Radix2Codec } from "./radix2.ts";

/**
 * Base32 (RFC 4648 §6): `A`-`Z` and `2`-`7`, padded with `=` to blocks of eight. Decoding takes
 * lowercase letters and skips ASCII whitespace.
 */
export const base32: Radix2Codec = radix2({
  name: "base32",
  alphabet: "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567",
  padding: true,
  caseInsensitive: true,
  ignore: ASCII_WHITESPACE,
});

/**
 * Base32 with the extended hex alphabet (RFC 4648 §7): `0`-`9` and `A`-`V`, so the text sorts
 * in byte order. Padded like base32.
 */
export const base32hex: Radix2Codec = radix2({
  name: "base32hex",
  alphabet: "0123456789ABCDEFGHIJKLMNOPQRSTUV",
  padding: true,
  caseInsensitive: true,
  ignore: ASCII_WHITESPACE,
});

/**
 * Crockford's Base32: digits and letters without `I`, `L`, `O` and `U`, unpadded. Decoding
 * ignores case and hyphens and reads `O` as `0`, `I` and `L` as `1`, as Crockford specifies.
 * This is the byte encoding; Crockford's number encoding and its check symbol are not.
 */
export const base32crockford: Radix2Codec = radix2({
  name: "base32-crockford",
  alphabet: "0123456789ABCDEFGHJKMNPQRSTVWXYZ",
  padding: false,
  caseInsensitive: true,
  aliases: { O: "0", I: "1", L: "1" },
  ignore: /[-\t\n\f\r ]/u,
});

/**
 * z-base-32 (Zooko O'Whielacronx, 2002): a lowercase alphabet ordered so the commonest
 * characters are the easiest to read and say, unpadded. Written for Mnet; Lightning node
 * message signatures use it.
 */
export const zbase32: Radix2Codec = radix2({
  name: "z-base-32",
  alphabet: "ybndrfg8ejkmcpqxot1uwisza345h769",
  padding: false,
  caseInsensitive: true,
  ignore: ASCII_WHITESPACE,
});
