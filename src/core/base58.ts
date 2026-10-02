import { hash256 } from "@agntn/hashes/sha2";
import { alphabetIndex, concat, equalBytes } from "./bytes.ts";
import { ChecksumError, DecodeError, named } from "./errors.ts";

/** A codec over one base58 alphabet. */
export interface Base58Codec {
  encode(bytes: Uint8Array): string;
  decode(text: string): Uint8Array;
}

/**
 * Builds a base58 codec: the bytes read as one big-endian number written in base 58, with each
 * leading zero byte kept as one leading copy of the alphabet's first character.
 *
 * @param name - Registry name, used in error messages.
 * @param alphabet - The 58 characters in value order.
 * @returns {Base58Codec} The codec.
 */
function base58Codec(name: string, alphabet: string): Base58Codec {
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
      let out = zero.repeat(zeros);
      for (let digit = digits.length - 1; digit >= 0; digit--) out += alphabet[digits[digit]!];
      return out;
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

/** Base58 with Bitcoin's alphabet, also used by IPFS CIDv0, Solana and Monero's blocks. */
export const base58: Base58Codec = base58Codec("base58", BASE58_ALPHABET);

/** Base58 with Flickr's alphabet: Bitcoin's with each lowercase and uppercase run swapped. */
export const base58flickr: Base58Codec = base58Codec(
  "base58-flickr",
  "123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ",
);

/** Base58 with the XRP Ledger's alphabet, where account addresses start with `r`. */
export const base58ripple: Base58Codec = base58Codec(
  "base58-ripple",
  "rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz",
);

/**
 * Base58Check, Bitcoin's form for addresses, WIF keys and extended keys: the payload and the
 * first four bytes of its double SHA-256, in Bitcoin's base58. The payload starts with the
 * version byte or bytes; this codec keeps them in it and checks nothing but the checksum.
 */
export const base58check: Base58Codec = {
  /**
   * Appends the checksum and writes the result in base58.
   *
   * @param payload - Version bytes and data.
   * @returns {string} The Base58Check text.
   */
  encode(payload: Uint8Array): string {
    return base58.encode(concat(payload, hash256(payload).subarray(0, 4)));
  },

  /**
   * Reads base58, checks the four-byte checksum and returns what it covers.
   *
   * @param text - Base58Check text.
   * @returns {Uint8Array} The payload, version bytes included.
   */
  decode(text: string): Uint8Array {
    let bytes: Uint8Array;
    try {
      bytes = base58.decode(text);
    } catch (error) {
      if (error instanceof DecodeError) {
        throw new DecodeError("base58check", error.message.replace(/^base58: /u, ""), error.index);
      }
      throw error;
    }
    if (bytes.length < 4) {
      throw new DecodeError("base58check", `${bytes.length} bytes leave no room for a checksum`);
    }
    const payload = bytes.subarray(0, -4);
    if (!equalBytes(bytes.subarray(-4), hash256(payload).subarray(0, 4))) {
      throw new ChecksumError("base58check");
    }
    return payload;
  },
};
