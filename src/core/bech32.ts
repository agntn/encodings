import { alphabetIndex } from "./bytes.ts";
import { ChecksumError, DecodeError, InvalidOptionError, named } from "./errors.ts";

const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const VALUES = alphabetIndex(CHARSET);
const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3] as const;

/** Longest string BIP173 allows; Lightning invoices and others raise it. */
export const BECH32_LIMIT = 90;

/** Text split into its human-readable prefix and its 5-bit data words, checksum removed. */
export interface Bech32Words {
  /** Human-readable part, lowercase, such as `bc` or `npub`. */
  prefix: string;
  /** Data words, 0 to 31 each. */
  words: number[];
}

/** Text split into its prefix and the bytes its words carry. */
export interface Bech32Bytes {
  /** Human-readable part, lowercase. */
  prefix: string;
  /** Data bytes. */
  bytes: Uint8Array;
}

/** A segregated witness address split into its parts. */
export interface SegwitAddress {
  /** Human-readable part: `bc`, `tb`, `bcrt` and so on. */
  prefix: string;
  /** Witness version, 0 to 16. */
  version: number;
  /** Witness program, 2 to 40 bytes. */
  program: Uint8Array;
}

/**
 * The BCH checksum's running remainder over the given values.
 *
 * @param values - Expanded prefix and data words.
 * @returns {number} The remainder.
 */
function polymod(values: readonly number[]): number {
  let checksum = 1;
  for (const value of values) {
    const top = checksum >>> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ value;
    for (let bit = 0; bit < 5; bit++) {
      if ((top >>> bit) & 1) checksum ^= GENERATOR[bit]!;
    }
  }
  return checksum >>> 0;
}

/**
 * The prefix as the checksum reads it: each character's high bits, a zero, then its low bits.
 *
 * @param prefix - Lowercase prefix.
 * @returns {number[]} The expanded values.
 */
function expandPrefix(prefix: string): number[] {
  const codes = Array.from({ length: prefix.length }, (_, index) => prefix.codePointAt(index)!);
  const high = codes.map((code) => code >> 5);
  const low = codes.map((code) => code & 31);
  return [...high, 0, ...low];
}

/**
 * Regroups bits, most significant first: bytes to 5-bit words or back.
 *
 * @param data - Input groups.
 * @param from - Bits per input group.
 * @param to - Bits per output group.
 * @param pad - Whether to pad a partial last group with zero bits; without it, leftover bits must
 * be fewer than `from` and all zero.
 * @returns {number[] | undefined} The groups, or `undefined` when the leftover bits break that rule.
 */
function convertBits(
  data: Uint8Array | readonly number[],
  from: number,
  to: number,
  pad: boolean,
): number[] | undefined {
  let buffer = 0;
  let held = 0;
  const out: number[] = [];
  const mask = (1 << to) - 1;
  for (const value of data) {
    if (value < 0 || value >> from !== 0) return undefined;
    buffer = ((buffer << from) | value) & 0xfff;
    held += from;
    while (held >= to) {
      held -= to;
      out.push((buffer >> held) & mask);
    }
  }
  if (pad) {
    if (held > 0) out.push((buffer << (to - held)) & mask);
  } else if (held >= from || ((buffer << (to - held)) & mask) !== 0) {
    return undefined;
  }
  return out;
}

/**
 * Checks the shape of bech32 text and finds its prefix: within the limit, one case, a `1` with
 * a prefix of printable ASCII before it and at least six characters after it.
 *
 * @param name - Variant name, for errors.
 * @param text - The text as given.
 * @param limit - Longest text allowed.
 * @returns {{ prefix: string, separator: number }} The lowercase prefix and the index of the `1`.
 */
function splitPrefix(
  name: string,
  text: string,
  limit: number,
): { prefix: string; separator: number } {
  if (text.length > limit) {
    throw new DecodeError(name, `${text.length} characters, over the limit of ${limit}`);
  }
  const lower = text.toLowerCase();
  if (text !== lower && text !== text.toUpperCase()) {
    throw new DecodeError(name, "mixes lowercase and uppercase");
  }
  const separator = lower.lastIndexOf("1");
  if (separator < 1) throw new DecodeError(name, 'no human-readable part before a "1"');
  if (lower.length - separator - 1 < 6) {
    throw new DecodeError(name, 'fewer than six characters after the last "1"');
  }
  const bad = lower.slice(0, separator).search(/[^!-~]/u);
  if (bad !== -1) {
    const character = String.fromCodePoint(text.codePointAt(bad)!);
    throw new DecodeError(
      name,
      `${named(character)} at index ${bad} is not allowed in the prefix`,
      bad,
    );
  }
  return { prefix: lower.slice(0, separator), separator };
}

/**
 * Reads the characters after the separator as 5-bit words, checksum included.
 *
 * @param name - Variant name, for errors.
 * @param text - The text as given.
 * @param separator - Index of the last `1`.
 * @returns {number[]} The words.
 */
function dataWords(name: string, text: string, separator: number): number[] {
  const words: number[] = [];
  for (let index = separator + 1; index < text.length; index++) {
    const value = VALUES.get(text[index]!.toLowerCase());
    if (value === undefined) {
      throw new DecodeError(
        name,
        `${named(text[index]!)} at index ${index} is not in the alphabet`,
        index,
      );
    }
    words.push(value);
  }
  return words;
}

/** One checksum variant: bech32 or bech32m. */
export interface Bech32Codec {
  /**
   * Writes a prefix and data words with this variant's checksum.
   * @param prefix - Human-readable part, 1 to 83 characters from `!` to `~`.
   * @param words - Data words, 0 to 31 each.
   * @param limit - Longest result allowed. Default: 90.
   */
  encodeWords(prefix: string, words: readonly number[], limit?: number): string;
  /**
   * Splits text into its prefix and data words after checking this variant's checksum.
   * @param text - Bech32 text, all lowercase or all uppercase.
   * @param limit - Longest text allowed. Default: 90.
   */
  decodeWords(text: string, limit?: number): Bech32Words;
  /**
   * Writes a prefix and bytes, the bytes regrouped into words with zero padding.
   * @param prefix - Human-readable part.
   * @param bytes - Data bytes.
   * @param limit - Longest result allowed. Default: 90.
   */
  encode(prefix: string, bytes: Uint8Array, limit?: number): string;
  /**
   * Splits text into its prefix and the bytes its words carry.
   * @param text - Bech32 text.
   * @param limit - Longest text allowed. Default: 90.
   */
  decode(text: string, limit?: number): Bech32Bytes;
}

/**
 * Builds one checksum variant.
 *
 * @param name - Registry name.
 * @param constant - What the checksum's remainder must equal: 1 for bech32, `0x2bc830a3` for bech32m.
 * @returns {Bech32Codec} The codec.
 */
function bech32Codec(name: string, constant: number): Bech32Codec {
  const codec: Bech32Codec = {
    encodeWords(prefix, words, limit = BECH32_LIMIT) {
      checkPrefix(prefix);
      const lower = prefix.toLowerCase();
      if (words.some((word) => !Number.isInteger(word) || word < 0 || word > 31)) {
        throw new InvalidOptionError("words", "[…]", "every word must be an integer from 0 to 31");
      }
      const length = lower.length + 1 + words.length + 6;
      if (length > limit) {
        throw new InvalidOptionError("limit", limit, `the result would be ${length} characters`);
      }
      const remainder = polymod([...expandPrefix(lower), ...words, 0, 0, 0, 0, 0, 0]) ^ constant;
      let out = `${lower}1`;
      for (const word of words) out += CHARSET[word];
      for (let index = 0; index < 6; index++)
        out += CHARSET[(remainder >>> (5 * (5 - index))) & 31];
      return out;
    },

    decodeWords(text, limit = BECH32_LIMIT) {
      const { prefix, separator } = splitPrefix(name, text, limit);
      const words = dataWords(name, text, separator);
      const remainder = polymod([...expandPrefix(prefix), ...words]);
      if (remainder !== constant) {
        const other = remainder === OTHER[name];
        throw new ChecksumError(
          name,
          other ? `checksum is ${name === "bech32" ? "bech32m" : "bech32"}'s` : undefined,
        );
      }
      return { prefix, words: words.slice(0, -6) };
    },

    encode(prefix, bytes, limit) {
      return codec.encodeWords(prefix, convertBits(bytes, 8, 5, true)!, limit);
    },

    decode(text, limit) {
      const { prefix, words } = codec.decodeWords(text, limit);
      const bytes = convertBits(words, 5, 8, false);
      if (!bytes) {
        throw new DecodeError(
          name,
          "words do not regroup into whole bytes; a segwit address carries a version word first",
        );
      }
      return { prefix, bytes: Uint8Array.from(bytes) };
    },
  };
  return codec;
}

/** The checksum constant each variant would see from the other one's text. */
const OTHER: Readonly<Record<string, number>> = { bech32: 0x2bc830a3, bech32m: 1 };

/**
 * Checks a prefix for encoding.
 *
 * @param prefix - Prefix as given.
 */
function checkPrefix(prefix: string): void {
  if (prefix.length < 1 || prefix.length > 83) {
    throw new InvalidOptionError("prefix", prefix, "must be 1 to 83 characters");
  }
  if (!/^[!-~]+$/u.test(prefix)) {
    throw new InvalidOptionError("prefix", prefix, "takes only ASCII from ! to ~");
  }
  if (prefix !== prefix.toLowerCase() && prefix !== prefix.toUpperCase()) {
    throw new InvalidOptionError("prefix", prefix, "mixes lowercase and uppercase");
  }
}

/** Bech32 (BIP173): segwit version 0 addresses, Lightning invoices, Nostr keys, Cosmos accounts. */
export const bech32: Bech32Codec = bech32Codec("bech32", 1);

/** Bech32m (BIP350): bech32 with a new checksum constant, for segwit version 1 and later. */
export const bech32m: Bech32Codec = bech32Codec("bech32m", 0x2bc830a3);

/**
 * Segregated witness addresses (BIP173, BIP350): a version word, then the program in words.
 * Version 0 uses bech32 with a 20 or 32-byte program; versions 1 to 16 use bech32m.
 */
export const segwit = {
  /**
   * Writes a segwit address.
   *
   * @param prefix - Network prefix: `bc`, `tb`, `bcrt`.
   * @param version - Witness version, 0 to 16.
   * @param program - Witness program.
   * @returns {string} The address.
   */
  encode(prefix: string, version: number, program: Uint8Array): string {
    const problem = witnessProblem(version, program);
    if (problem) throw new InvalidOptionError("program", program.length, problem);
    const codec = version === 0 ? bech32 : bech32m;
    return codec.encodeWords(prefix, [version, ...convertBits(program, 8, 5, true)!]);
  },

  /**
   * Reads a segwit address and checks its version, program and checksum variant.
   *
   * @param text - The address.
   * @returns {SegwitAddress} Its parts.
   */
  decode(text: string): SegwitAddress {
    let decoded: Bech32Words;
    let variant: "bech32" | "bech32m";
    try {
      decoded = bech32.decodeWords(text);
      variant = "bech32";
    } catch (error) {
      if (!(error instanceof ChecksumError)) throw error;
      decoded = bech32m.decodeWords(text);
      variant = "bech32m";
    }
    const [version, ...rest] = decoded.words;
    if (version === undefined) throw new DecodeError("segwit", "no witness version");
    const program = convertBits(rest, 5, 8, false);
    if (!program) throw new DecodeError("segwit", "program does not regroup into whole bytes");
    const bytes = Uint8Array.from(program);
    const problem = witnessProblem(version, bytes);
    if (problem) throw new DecodeError("segwit", problem);
    if ((version === 0) !== (variant === "bech32")) {
      throw new DecodeError(
        "segwit",
        `version ${version} needs ${version === 0 ? "bech32" : "bech32m"}, not ${variant}`,
      );
    }
    return { prefix: decoded.prefix, version, program: bytes };
  },
} as const;

/**
 * Checks a witness version and program against BIP141 and BIP173.
 *
 * @param version - Witness version.
 * @param program - Witness program.
 * @returns {string | undefined} Why they are invalid, or nothing when they are valid.
 */
function witnessProblem(version: number, program: Uint8Array): string | undefined {
  if (!Number.isInteger(version) || version < 0 || version > 16) {
    return `witness version ${version} is not 0 to 16`;
  }
  if (program.length < 2 || program.length > 40) {
    return `witness program of ${program.length} bytes is not 2 to 40`;
  }
  if (version === 0 && program.length !== 20 && program.length !== 32) {
    return `version 0 program of ${program.length} bytes is not 20 or 32`;
  }
  return undefined;
}
