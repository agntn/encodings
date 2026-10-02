import { DecodeError, named } from "./errors.ts";

/** Options for writing bytes as numbers. */
export interface NumbersEncodeOptions {
  /** Put a space between bytes. Without it each byte takes three digits. Default: true. */
  separate?: boolean;
}

/** A codec for bytes written as numbers, one per byte. */
export interface NumbersCodec {
  /**
   * Writes bytes as numbers.
   *
   * @param bytes - Bytes to write.
   * @param options - Whether to space the numbers.
   * @returns {string} One number per byte.
   */
  encode(bytes: Uint8Array, options?: Readonly<NumbersEncodeOptions>): string;
  /**
   * Reads numbers as bytes.
   *
   * @param text - Numbers split by whitespace or commas, or runs of three digits.
   * @returns {Uint8Array} The bytes.
   */
  decode(text: string): Uint8Array;
}

/** What tells one radix from another: its name, base and the error for a stray character. */
interface Numbers {
  name: string;
  radix: number;
  notDigit: string;
}

/** Digits of a byte value with no separator between bytes. */
const WIDTH = 3;

/**
 * Checks that every character between two separators is a digit of the radix.
 *
 * @param numbers - The radix.
 * @param token - Characters between separators.
 * @param start - Index of the token in the text, for errors.
 */
function checkDigits(numbers: Readonly<Numbers>, token: string, start: number): void {
  let index = start;
  for (const character of token) {
    if (!(Number.parseInt(character, numbers.radix) >= 0)) {
      throw new DecodeError(numbers.name, `${named(character)} ${numbers.notDigit}`, index);
    }
    index += character.length;
  }
}

/**
 * Reads the digits of one byte.
 *
 * @param numbers - The radix.
 * @param run - Digits of one byte.
 * @param start - Index of the run in the text, for errors.
 * @returns {number} The byte.
 */
function byteOf(numbers: Readonly<Numbers>, run: string, start: number): number {
  const value = Number.parseInt(run, numbers.radix);
  if (value > 255) {
    throw new DecodeError(numbers.name, `"${run}" at index ${start} is over 255`, start);
  }
  return value;
}

/**
 * Reads one number, or a run of numbers three digits each with no separator.
 *
 * @param numbers - The radix.
 * @param token - Characters between separators.
 * @param start - Index of the token in the text.
 * @returns {number[]} The bytes it holds.
 */
function bytesOf(numbers: Readonly<Numbers>, token: string, start: number): number[] {
  checkDigits(numbers, token, start);
  if (token.length <= WIDTH) return [byteOf(numbers, token, start)];
  if (token.length % WIDTH !== 0) {
    throw new DecodeError(
      numbers.name,
      `${token.length} digits at index ${start} are not one number or groups of ${WIDTH}`,
      start,
    );
  }
  const out: number[] = [];
  for (let offset = 0; offset < token.length; offset += WIDTH) {
    out.push(byteOf(numbers, token.slice(offset, offset + WIDTH), start + offset));
  }
  return out;
}

/**
 * Builds the codec for one radix. Decoding splits on whitespace and commas, so `72 105`,
 * `72,105` and `72, 105` read the same, and reads an unbroken run as three digits per byte.
 *
 * @param numbers - The radix.
 * @returns {NumbersCodec} The codec.
 */
export function createNumbers(numbers: Readonly<Numbers>): NumbersCodec {
  return {
    encode(bytes, options = {}) {
      const separate = options.separate !== false;
      const values = Array.from(bytes, (byte) => {
        const digits = byte.toString(numbers.radix);
        return separate ? digits : digits.padStart(WIDTH, "0");
      });
      return values.join(separate ? " " : "");
    },
    decode(text) {
      const out: number[] = [];
      for (const match of text.matchAll(/[^\t\n\f\r ,]+/gu)) {
        out.push(...bytesOf(numbers, match[0], match.index));
      }
      return Uint8Array.from(out);
    },
  };
}
