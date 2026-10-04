import { byAlphabet } from "./alphabets.ts";
import { ASCII_WHITESPACE } from "./bytes.ts";
import { radix2, type PaddedCodec } from "./radix2.ts";

/** The base32 alphabets, in the order `info().options` lists them. */
export const BASE32_ALPHABETS = ["standard", "hex", "crockford", "z"] as const;

/**
 * A base32 alphabet: RFC 4648 §6 (`standard`) and §7 (`hex`), Crockford's, or z-base-32 (`z`).
 */
export type Base32Alphabet = (typeof BASE32_ALPHABETS)[number];

/** Options for reading and writing base32. */
export interface Base32Options {
  /** Alphabet to use. Default: `standard`. */
  alphabet?: Base32Alphabet;
}

/** Options for reading base32. */
export interface Base32DecodeOptions extends Base32Options {
  /** Refuse non-zero bits past the last byte, so `MZ` stops passing for `MY`. Default: false. */
  canonical?: boolean;
}

/** Options for base32 output. */
export interface Base32EncodeOptions extends Base32Options {
  /**
   * Pad the last block with `=` to eight characters. Default: true. Only the two RFC 4648
   * alphabets pad; Crockford's and z-base-32 never do.
   */
  padding?: boolean;
}

/** Base32 in any of its four alphabets. */
export interface Base32Codec {
  encode(bytes: Uint8Array, options?: Readonly<Base32EncodeOptions>): string;
  decode(text: string, options?: Readonly<Base32DecodeOptions>): Uint8Array;
}

const CODECS: Readonly<Record<Base32Alphabet, PaddedCodec>> = {
  standard: radix2({
    name: "base32",
    alphabet: "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567",
    padding: true,
    caseInsensitive: true,
    ignore: ASCII_WHITESPACE,
  }),
  hex: radix2({
    name: "base32",
    alphabet: "0123456789ABCDEFGHIJKLMNOPQRSTUV",
    padding: true,
    caseInsensitive: true,
    ignore: ASCII_WHITESPACE,
  }),
  crockford: radix2({
    name: "base32",
    alphabet: "0123456789ABCDEFGHJKMNPQRSTVWXYZ",
    padding: false,
    caseInsensitive: true,
    aliases: { O: "0", I: "1", L: "1" },
    ignore: /[-\t\n\f\r ]/u,
  }),
  z: radix2({
    name: "base32",
    alphabet: "ybndrfg8ejkmcpqxot1uwisza345h769",
    padding: false,
    caseInsensitive: true,
    ignore: ASCII_WHITESPACE,
  }),
};

/**
 * Base32 (RFC 4648 §6): `A`-`Z` and `2`-`7`, padded with `=` to blocks of eight. Decoding takes
 * lowercase and skips whitespace. The other alphabets:
 *
 * - `hex`, RFC 4648 §7: `0`-`9` and `A`-`V`, which sorts in byte order.
 * - `crockford`, Douglas Crockford's: digits and letters without `I`, `L`, `O` and `U`,
 *   unpadded. Decoding also skips hyphens and reads `O` as `0`, `I` and `L` as `1`. This is the
 *   byte encoding; Crockford's number encoding and its check symbol are not.
 * - `z`, z-base-32 (Zooko O'Whielacronx, 2002): lowercase, ordered so the commonest characters
 *   are the easiest to read and say, unpadded. Lightning node message signatures use it.
 */
export const base32: Base32Codec = {
  encode(bytes, options = {}) {
    const alphabet = options.alphabet ?? "standard";
    const pads = alphabet === "standard" || alphabet === "hex";
    const codec = byAlphabet(CODECS, alphabet, "standard");
    return codec.encode(bytes, { padding: pads && (options.padding ?? true) });
  },
  decode: (text, options = {}) =>
    byAlphabet(CODECS, options.alphabet, "standard").decode(text, options),
};
