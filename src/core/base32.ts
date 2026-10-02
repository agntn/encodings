import { ASCII_WHITESPACE } from "./bytes.ts";
import { radix2, type Radix2Codec } from "./radix2.ts";

/** Options for reading and writing base32. */
export interface Base32Options {
  /** Use the extended hex alphabet of RFC 4648 §7, `0`-`9` and `A`-`V`. Default: false. */
  hex?: boolean;
}

/** Options for base32 output. */
export interface Base32EncodeOptions extends Base32Options {
  /** Pad the last block with `=` to eight characters. Default: true. */
  padding?: boolean;
}

/** RFC 4648 base32 in either of its two alphabets. */
export interface Base32Codec {
  encode(bytes: Uint8Array, options?: Readonly<Base32EncodeOptions>): string;
  decode(text: string, options?: Readonly<Base32Options>): Uint8Array;
}

const RFC = radix2({
  name: "base32",
  alphabet: "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567",
  padding: true,
  caseInsensitive: true,
  ignore: ASCII_WHITESPACE,
});

const EXTENDED_HEX = radix2({
  name: "base32",
  alphabet: "0123456789ABCDEFGHIJKLMNOPQRSTUV",
  padding: true,
  caseInsensitive: true,
  ignore: ASCII_WHITESPACE,
});

/**
 * Base32 (RFC 4648 §6): `A`-`Z` and `2`-`7`, padded with `=` to blocks of eight. `hex` switches
 * to the §7 alphabet, which sorts in byte order. Decoding takes lowercase and skips whitespace.
 */
export const base32: Base32Codec = {
  encode: (bytes, options = {}) =>
    (options.hex ? EXTENDED_HEX : RFC).encode(bytes, { padding: options.padding ?? true }),
  decode: (text, options = {}) => (options.hex ? EXTENDED_HEX : RFC).decode(text),
};

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
