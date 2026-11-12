import { DecodeError, EncodingError, InvalidOptionError } from "./errors.ts";
import { NUMBER } from "./numbers.ts";

/** Options that change what the numbers stand for. */
export interface CodePointsOptions {
  /** Each number is a code point of UTF-8 text. Default: false. */
  codepoints?: boolean;
}

/** How one encoding writes and reads a code point. */
export interface CodePointNumbers {
  /** Registry name, for errors. */
  name: string;
  /** The highest code point as this encoding writes it, for errors. */
  max: string;
  /**
   * Reads one number, throwing at a character that is not a digit.
   *
   * @param token - Characters between separators.
   * @param start - Index of the token in the text, for errors.
   * @returns {number} The value of the digits.
   */
  read(token: string, start: number): number;
  /**
   * Writes one code point.
   *
   * @param point - A code point.
   * @returns {string} The number.
   */
  write(point: number): string;
}

/** Code points as numbers: UTF-8 text in, one number per character out, and back. */
export interface CodePointsCodec {
  /**
   * Writes UTF-8 text as one number per character, spaced.
   *
   * @param bytes - UTF-8 text.
   * @returns {string} The numbers.
   */
  encode(bytes: Uint8Array): string;
  /**
   * Reads numbers split by whitespace or commas as characters.
   *
   * @param text - The numbers.
   * @returns {Uint8Array} The characters as UTF-8.
   */
  decode(text: string): Uint8Array;
}

/** The highest code point Unicode has. */
const MAX_CODE_POINT = 0x10_ff_ff;

const utf8Decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

const utf8Encoder = new TextEncoder();

/**
 * Checks `codepoints`, which callers without types can pass as anything.
 *
 * @param options - Options from the caller.
 * @returns {boolean} Whether the numbers are code points.
 */
export function codepointsOf(options: Readonly<CodePointsOptions>): boolean {
  const { codepoints = false } = options;
  if (typeof codepoints !== "boolean") {
    throw new InvalidOptionError("codepoints", codepoints, "must be a boolean");
  }
  return codepoints;
}

/**
 * Code points in one radix, none over U+10FFFF and no surrogates.
 *
 * @param numbers - How the radix reads and writes one number.
 * @returns {CodePointsCodec} The codec.
 */
export function createCodePoints(numbers: Readonly<CodePointNumbers>): CodePointsCodec {
  const { name } = numbers;
  return {
    encode(bytes) {
      let text: string;
      try {
        text = utf8Decoder.decode(bytes);
      } catch {
        throw new EncodingError(
          `${name}: encode with codepoints takes UTF-8 text, and these bytes are not`,
        );
      }
      return Array.from(text, (character) => numbers.write(character.codePointAt(0)!)).join(" ");
    },
    decode(text) {
      const characters: string[] = [];
      for (const { 0: token, index: start } of text.matchAll(NUMBER)) {
        const value = numbers.read(token, start);
        if (value > MAX_CODE_POINT) {
          throw new DecodeError(name, `"${token}" at index ${start} is over ${numbers.max}`, start);
        }
        if (value >= 0xd8_00 && value <= 0xdf_ff) {
          throw new DecodeError(
            name,
            `"${token}" at index ${start} is a surrogate, not a character`,
            start,
          );
        }
        characters.push(String.fromCodePoint(value));
      }
      return utf8Encoder.encode(characters.join(""));
    },
  };
}
