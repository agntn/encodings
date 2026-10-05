import { sha256 } from "@agntn/hashes/sha2";
import { byAlphabet } from "./alphabets.ts";
import { TextWriter, alphabetIndex, concat, equalBytes } from "./bytes.ts";
import { ChecksumError, DecodeError, InvalidOptionError, named } from "./errors.ts";

/** A codec over one base58 alphabet, with no options. */
export interface Base58CheckCodec {
  encode(bytes: Uint8Array): string;
  decode(text: string): Uint8Array;
}

/** The base58 alphabets, in the order `info().options` lists them. */
export const BASE58_ALPHABETS = ["bitcoin", "flickr", "ripple"] as const;

/** A base58 alphabet: Bitcoin's, Flickr's or the XRP Ledger's. */
export type Base58Alphabet = (typeof BASE58_ALPHABETS)[number];

/** Options for reading and writing base58. */
export interface Base58Options {
  /** Alphabet to use. Default: `bitcoin`. */
  alphabet?: Base58Alphabet;
  /**
   * Add a four-byte double SHA-256 checksum when writing, and check and strip it when reading,
   * as Base58Check does. Default: false.
   */
  check?: boolean;
}

/** Base58 in any of its three alphabets, with or without the Base58Check checksum. */
export interface Base58Codec {
  encode(bytes: Uint8Array, options?: Readonly<Base58Options>): string;
  decode(text: string, options?: Readonly<Base58Options>): Uint8Array;
}

/**
 * Builds a base58 codec: the bytes read as one big-endian number written in base 58, with each
 * leading zero byte kept as one leading copy of the alphabet's first character.
 *
 * @param name - Registry name, used in error messages.
 * @param alphabet - The 58 characters in value order.
 * @returns {Base58CheckCodec} The codec.
 */
function base58Codec(name: string, alphabet: string): Base58CheckCodec {
  const values = alphabetIndex(alphabet);
  const zero = alphabet[0]!;

  return {
    encode(bytes) {
      let zeros = 0;
      while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
      /** Base-58 digits, least significant first. */
      const digits: number[] = [];
      for (let index = zeros; index < bytes.length; index++) {
        let carry = bytes[index]!;
        for (let digit = 0; digit < digits.length; digit++) {
          carry += digits[digit]! << 8;
          digits[digit] = carry % 58;
          carry = Math.floor(carry / 58);
        }
        while (carry > 0) {
          digits.push(carry % 58);
          carry = Math.floor(carry / 58);
        }
      }
      const out = new TextWriter(zeros + digits.length);
      for (let index = 0; index < zeros; index++) out.point(alphabet.codePointAt(0)!);
      for (let digit = digits.length - 1; digit >= 0; digit--) {
        out.point(alphabet.codePointAt(digits[digit]!)!);
      }
      return out.toString();
    },

    decode(text) {
      let zeros = 0;
      while (zeros < text.length && text[zeros] === zero) zeros++;
      /** Bytes, least significant first. */
      const bytes: number[] = [];
      let index = 0;
      for (const character of text) {
        const value = values.get(character);
        if (value === undefined) {
          throw new DecodeError(
            name,
            `${named(character)} at index ${index} is not in the alphabet`,
            index,
          );
        }
        index += character.length;
        if (index <= zeros) continue;
        let carry = value;
        for (let byte = 0; byte < bytes.length; byte++) {
          carry += bytes[byte]! * 58;
          bytes[byte] = carry & 0xff;
          carry >>= 8;
        }
        while (carry > 0) {
          bytes.push(carry & 0xff);
          carry >>= 8;
        }
      }
      const out = new Uint8Array(zeros + bytes.length);
      for (let byte = 0; byte < bytes.length; byte++) out[out.length - 1 - byte] = bytes[byte]!;
      return out;
    },
  };
}

/** Bitcoin's base58 alphabet: digits and letters without `0`, `O`, `I` and `l`. */
export const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** The characters of each alphabet in value order. */
const DIGITS: Readonly<Record<Base58Alphabet, string>> = {
  bitcoin: BASE58_ALPHABET,
  flickr: "123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ",
  ripple: "rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz",
};

/**
 * Wraps a codec so it appends the first four bytes of the payload's double hash, and checks and
 * strips them when reading.
 *
 * @param name - Registry name, for errors.
 * @param codec - The plain codec.
 * @param hash - The checksum hash, run twice.
 * @returns {Base58CheckCodec} The codec.
 */
function withChecksum(
  name: string,
  codec: Readonly<Base58CheckCodec>,
  hash: (bytes: Uint8Array) => Uint8Array,
): Base58CheckCodec {
  /**
   * The first four bytes of the payload's double hash.
   *
   * @param payload - The payload.
   * @returns {Uint8Array} The checksum.
   */
  function checksum(payload: Uint8Array): Uint8Array {
    const digest = hash(hash(payload));
    if (digest.length < 4) {
      throw new InvalidOptionError("hash", digest.length, "must return at least 4 bytes");
    }
    return digest.subarray(0, 4);
  }

  return {
    encode(payload) {
      return codec.encode(concat(payload, checksum(payload)));
    },

    decode(text) {
      const bytes = codec.decode(text);
      if (bytes.length < 4) {
        throw new DecodeError(name, `${bytes.length} bytes leave no room for a checksum`);
      }
      const payload = bytes.subarray(0, -4);
      if (!equalBytes(bytes.subarray(-4), checksum(payload))) throw new ChecksumError(name);
      return payload;
    },
  };
}

const PLAIN: Readonly<Record<Base58Alphabet, Base58CheckCodec>> = {
  bitcoin: base58Codec("base58", DIGITS.bitcoin),
  flickr: base58Codec("base58", DIGITS.flickr),
  ripple: base58Codec("base58", DIGITS.ripple),
};

const CHECKED: Readonly<Record<Base58Alphabet, Base58CheckCodec>> = {
  bitcoin: withChecksum("base58", PLAIN.bitcoin, sha256),
  flickr: withChecksum("base58", PLAIN.flickr, sha256),
  ripple: withChecksum("base58", PLAIN.ripple, sha256),
};

/**
 * Picks the codec for a set of options.
 *
 * @param options - Alphabet and checksum.
 * @returns {Base58CheckCodec} The codec.
 */
function codecFor(options: Readonly<Base58Options>): Base58CheckCodec {
  return byAlphabet(options.check === true ? CHECKED : PLAIN, options.alphabet, "bitcoin");
}

/**
 * Base58: the bytes as one big-endian number in base 58, each leading zero byte kept as one
 * leading copy of the alphabet's first character. Bitcoin's alphabet by default, as IPFS
 * CIDv0, Solana and Monero's blocks use it; `flickr` swaps its lowercase and uppercase runs for
 * Flickr's short URLs, and `ripple` is the XRP Ledger's, where account addresses start with
 * `r`. `check` turns it into Base58Check: the payload and the first four bytes of its double
 * SHA-256, the form of Bitcoin addresses, WIF keys, extended keys and XRP Ledger addresses. The
 * payload starts with the version byte or bytes; `check` keeps them in it and checks nothing but
 * the checksum.
 */
export const base58: Base58Codec = {
  encode: (bytes, options = {}) => codecFor(options).encode(bytes),
  decode: (text, options = {}) => codecFor(options).decode(text),
};

/**
 * Builds Base58Check over another hash or alphabet, the way Decred uses it.
 *
 * @param hash - The checksum hash, such as `blake256` from `@agntn/hashes/blake256`.
 * @param alphabet - The 58 characters in value order. Bitcoin's when left out.
 * @returns {Base58CheckCodec} The codec. Its errors name `base58check`.
 */
export function createBase58check(
  hash: (bytes: Uint8Array) => Uint8Array,
  alphabet: string = BASE58_ALPHABET,
): Base58CheckCodec {
  if (alphabet.length !== 58 || new Set(alphabet).size !== 58) {
    throw new InvalidOptionError("alphabet", alphabet, "needs 58 distinct characters");
  }
  return withChecksum("base58check", base58Codec("base58check", alphabet), hash);
}

/**
 * Builds plain base58 in one alphabet, with no `check`, so its bundle never reaches SHA-256.
 *
 * @param alphabet - `bitcoin`, `flickr` or `ripple`. Default: `bitcoin`.
 * @returns {Base58CheckCodec} A codec of its own. Its errors name `base58`.
 */
export function createBase58(alphabet: Base58Alphabet = "bitcoin"): Base58CheckCodec {
  return base58Codec("base58", byAlphabet(DIGITS, alphabet, "bitcoin"));
}
