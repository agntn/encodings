import { alphabetIndex, inputIndex } from "./bytes.ts";
import { DecodeError, named } from "./errors.ts";

/** How one power-of-two alphabet writes bytes: base32, base64 and their variants. */
export interface Radix2Spec {
  /** Registry name, used in error messages. */
  name: string;
  /** Characters in value order; the length is a power of two. */
  alphabet: string;
  /** Whether encoding pads the last block with `=`. Decoding takes the text with or without it. */
  padding: boolean;
  /** Whether decoding also takes the other case of each letter. */
  caseInsensitive?: boolean;
  /** Extra characters decoding reads as alphabet characters, such as Crockford's `O` for `0`. */
  aliases?: Readonly<Record<string, string>>;
  /** Characters decoding skips, such as the line breaks of MIME base64. */
  ignore?: RegExp;
}

/** A codec over one power-of-two alphabet. */
export interface Radix2Codec {
  encode(bytes: Uint8Array): string;
  decode(text: string): Uint8Array;
}

/** A radix-2 codec whose output can turn the spec's padding on or off. */
export interface PaddedCodec extends Radix2Codec {
  encode(bytes: Uint8Array, options?: Readonly<{ padding?: boolean }>): string;
}

/**
 * Greatest common divisor, for the block length of an alphabet.
 *
 * @param left - First number.
 * @param right - Second number.
 * @returns {number} The divisor.
 */
function gcd(left: number, right: number): number {
  return right === 0 ? left : gcd(right, left % right);
}

/**
 * Maps every character decoding takes to its value: the alphabet, its aliases and, when case
 * does not matter, both cases of each.
 *
 * @param alphabet - Characters in value order.
 * @param aliases - Extra characters and the alphabet character each stands for.
 * @param caseInsensitive - Whether to add the other case of every character.
 * @returns {Map<string, number>} Value by character.
 */
function valueMap(
  alphabet: string,
  aliases: Readonly<Record<string, string>>,
  caseInsensitive: boolean,
): Map<string, number> {
  const base = alphabetIndex(alphabet);
  const entries = [
    ...base,
    ...Object.entries(aliases).map(([alias, target]) => [alias, base.get(target)!] as const),
  ];
  const variants = caseInsensitive
    ? entries.flatMap(([character, value]) => [
        [character.toLowerCase(), value] as const,
        [character.toUpperCase(), value] as const,
      ])
    : [];
  return new Map([...entries, ...variants]);
}

/**
 * Splits trailing `=` padding off and checks it: nothing after it, and exactly as much as the
 * last block needs.
 *
 * @param name - Registry name, for errors.
 * @param body - The text without ignored characters.
 * @param blockChars - Characters in one padded block.
 * @param at - Index in the caller's text of an index in `body`.
 * @returns {string} The text without its padding.
 */
function withoutPadding(
  name: string,
  body: string,
  blockChars: number,
  at: (index: number) => number,
): string {
  const padStart = body.indexOf("=");
  if (padStart === -1) return body;
  const data = body.slice(0, padStart);
  const pad = body.slice(padStart);
  const stray = pad.search(/[^=]/u);
  if (stray !== -1) {
    const index = at(padStart + stray);
    throw new DecodeError(name, `character after padding at index ${index}`, index);
  }
  const expected = (blockChars - (data.length % blockChars)) % blockChars;
  if (pad.length !== expected) {
    throw new DecodeError(
      name,
      `${pad.length} padding characters where the length needs ${expected}`,
    );
  }
  return data;
}

/**
 * Builds a codec that reads bytes as one bit stream, most significant bit first, and writes each
 * group of `log2(alphabet.length)` bits as one character, as RFC 4648 does.
 *
 * @param spec - The alphabet and its rules.
 * @returns {PaddedCodec} The codec. `padding` in its options overrides the spec's.
 */
export function radix2(spec: Radix2Spec): PaddedCodec {
  const { name, alphabet, padding, caseInsensitive = false, aliases = {}, ignore } = spec;
  const bits = Math.log2(alphabet.length);
  if (!Number.isInteger(bits) || bits < 1 || bits > 8) {
    throw new TypeError(`${name}: alphabet length ${alphabet.length} is not a power of two`);
  }
  const mask = (1 << bits) - 1;
  /** Characters in one padded block: base64 writes 3 bytes as 4, base32 writes 5 as 8. */
  const blockChars = 8 / gcd(8, bits);
  const values = valueMap(alphabet, aliases, caseInsensitive);

  return {
    encode(bytes, options = {}) {
      let out = "";
      let buffer = 0;
      let held = 0;
      for (const byte of bytes) {
        buffer = ((buffer << 8) | byte) & 0xffff;
        held += 8;
        while (held >= bits) {
          held -= bits;
          out += alphabet[(buffer >> held) & mask];
        }
      }
      if (held > 0) out += alphabet[(buffer << (bits - held)) & mask];
      if (options.padding ?? padding) {
        const rest = out.length % blockChars;
        if (rest > 0) out += "=".repeat(blockChars - rest);
      }
      return out;
    },

    decode(text) {
      const body = ignore ? text.replaceAll(new RegExp(ignore.source, "gu"), "") : text;
      const at = (index: number): number =>
        ignore ? inputIndex(text, ignore.source, index) : index;
      const data = withoutPadding(name, body, blockChars, at);
      const totalBits = data.length * bits;
      const out = new Uint8Array(Math.floor(totalBits / 8));
      let buffer = 0;
      let held = 0;
      let written = 0;
      let index = 0;
      for (const character of data) {
        const value = values.get(character);
        if (value === undefined) {
          const where = at(index);
          throw new DecodeError(
            name,
            `${named(character)} at index ${where} is not in the alphabet`,
            where,
          );
        }
        buffer = ((buffer << bits) | value) & 0xffff;
        held += bits;
        if (held >= 8) {
          held -= 8;
          out[written++] = (buffer >> held) & 0xff;
        }
        index += character.length;
      }
      // Checked after the characters, so a stray character is named before the length it breaks.
      if (totalBits % 8 >= bits) {
        throw new DecodeError(
          name,
          `${data.length} characters do not end on a byte: drop or add characters`,
        );
      }
      return out;
    },
  };
}
