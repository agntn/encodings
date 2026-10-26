import { sha256 } from "@agntn/hashes/sha2";
import { byAlphabet } from "./alphabets.ts";
import {
  TextWriter,
  alphabetIndex,
  concat,
  equalBytes,
  requireBytes,
  requireText,
} from "./bytes.ts";
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
  /** Monero's block form: every eight bytes as exactly eleven characters. Default: false. */
  blocks?: boolean;
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
      requireBytes(`${name}: encode`, bytes);
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
      requireText(`${name}: decode`, text);
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
      requireBytes(`${name}: encode`, payload);
      return codec.encode(concat(payload, checksum(payload)));
    },

    decode(text) {
      requireText(`${name}: decode`, text);
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

/** Bytes in a full block of Monero's block base58. */
const BLOCK_BYTES = 8;

/** Characters of a full block. */
const BLOCK_CHARS = 11;

/** Characters a block of 0 to 8 bytes takes, padded in front with the alphabet's zero. */
const BLOCK_WIDTHS: readonly number[] = [0, 2, 3, 5, 6, 7, 9, 10, 11];

/**
 * Reads a block's bytes as one big-endian number.
 *
 * @param block - Up to eight bytes.
 * @returns {bigint} Its value.
 */
function blockValue(block: ArrayLike<number>): bigint {
  let value = 0n;
  for (let index = 0; index < block.length; index++) value = (value << 8n) | BigInt(block[index]!);
  return value;
}

/**
 * Spells a block's value at its full width.
 *
 * @param value - The block's value.
 * @param width - Characters the block takes.
 * @returns {number[]} The base-58 digits, most significant first, zeros in front.
 */
function blockDigits(value: bigint, width: number): number[] {
  const digits = Array.from<number>({ length: width }).fill(0);
  let rest = value;
  for (let digit = width - 1; rest > 0n; digit--) {
    digits[digit] = Number(rest % 58n);
    rest /= 58n;
  }
  return digits;
}

/**
 * Builds Monero's block base58, where the text length follows from the byte count alone.
 *
 * @param name - Registry name, used in error messages.
 * @param alphabet - The 58 characters in value order.
 * @returns {Base58CheckCodec} The codec.
 */
function blockCodec(name: string, alphabet: string): Base58CheckCodec {
  const values = alphabetIndex(alphabet);

  /**
   * Refuses the first character off the alphabet, before any length check can point inside one.
   *
   * @param text - The whole text.
   */
  function checkCharacters(text: string): void {
    for (let index = 0; index < text.length; index++) {
      if (values.has(text[index]!)) continue;
      const character = String.fromCodePoint(text.codePointAt(index)!);
      throw new DecodeError(
        name,
        `${named(character)} at index ${index} is not in the alphabet`,
        index,
      );
    }
  }

  /**
   * Reads one block back, refusing a value too big for the bytes its width stands for.
   *
   * @param text - The whole text, every character already in the alphabet.
   * @param start - Index of the block's first character.
   * @param out - Where its bytes go, as many as the block's width fixes.
   */
  function readBlock(text: string, start: number, out: Uint8Array): void {
    const end = Math.min(start + BLOCK_CHARS, text.length);
    let value = 0n;
    for (let index = start; index < end; index++) {
      value = value * 58n + BigInt(values.get(text[index]!)!);
    }
    if (value >> BigInt(out.length * 8) !== 0n) {
      throw new DecodeError(
        name,
        `the block at index ${start} overflows its ${out.length} bytes`,
        start,
      );
    }
    for (let byte = out.length - 1; byte >= 0; byte--) {
      out[byte] = Number(value & 0xffn);
      value >>= 8n;
    }
  }

  return {
    encode(bytes) {
      requireBytes(`${name}: encode`, bytes);
      const full = Math.floor(bytes.length / BLOCK_BYTES);
      const out = new TextWriter(full * BLOCK_CHARS + BLOCK_WIDTHS[bytes.length % BLOCK_BYTES]!);
      for (let start = 0; start < bytes.length; start += BLOCK_BYTES) {
        const block = bytes.subarray(start, start + BLOCK_BYTES);
        for (const digit of blockDigits(blockValue(block), BLOCK_WIDTHS[block.length]!)) {
          out.point(alphabet.codePointAt(digit)!);
        }
      }
      return out.toString();
    },

    decode(text) {
      requireText(`${name}: decode`, text);
      checkCharacters(text);
      const full = Math.floor(text.length / BLOCK_CHARS);
      const last = BLOCK_WIDTHS.indexOf(text.length % BLOCK_CHARS);
      if (last === -1) {
        throw new DecodeError(
          name,
          `no byte count writes a last block of width ${text.length % BLOCK_CHARS}`,
          full * BLOCK_CHARS,
        );
      }
      const out = new Uint8Array(full * BLOCK_BYTES + last);
      for (let block = 0; block * BLOCK_CHARS < text.length; block++) {
        const at = block * BLOCK_BYTES;
        readBlock(text, block * BLOCK_CHARS, out.subarray(at, at + BLOCK_BYTES));
      }
      return out;
    },
  };
}

const PLAIN: Readonly<Record<Base58Alphabet, Base58CheckCodec>> = {
  bitcoin: base58Codec("base58", DIGITS.bitcoin),
  flickr: base58Codec("base58", DIGITS.flickr),
  ripple: base58Codec("base58", DIGITS.ripple),
};

const BLOCKS: Readonly<Record<Base58Alphabet, Base58CheckCodec>> = {
  bitcoin: blockCodec("base58", DIGITS.bitcoin),
  flickr: blockCodec("base58", DIGITS.flickr),
  ripple: blockCodec("base58", DIGITS.ripple),
};

/**
 * Picks the codec for a set of options.
 *
 * @param options - Alphabet, checksum and blocks.
 * @returns {Base58CheckCodec} The codec. With `blocks`, `check` sums the payload before the cut.
 */
function codecFor(options: Readonly<Base58Options>): Base58CheckCodec {
  const codec = byAlphabet(options.blocks === true ? BLOCKS : PLAIN, options.alphabet, "bitcoin");
  return options.check === true ? withChecksum("base58", codec, sha256) : codec;
}

/**
 * Base58: the bytes as one big-endian number in base 58, each leading zero byte kept as one
 * leading copy of the alphabet's first character. Bitcoin's alphabet by default, as IPFS
 * CIDv0, Solana and Monero use it; `flickr` swaps its lowercase and uppercase runs for
 * Flickr's short URLs, and `ripple` is the XRP Ledger's, where account addresses start with
 * `r`. `check` turns it into Base58Check: the payload and the first four bytes of its double
 * SHA-256, the form of Bitcoin addresses, WIF keys, extended keys and XRP Ledger addresses. The
 * payload starts with the version byte or bytes; `check` keeps them in it and checks nothing but
 * the checksum. `blocks` is Monero's take: eight bytes per eleven characters, so a 69-byte address
 * is always 95 characters long.
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
