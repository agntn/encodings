import { alphabetIndex } from "./bytes.ts";
import { DecodeError, named } from "./errors.ts";

const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&()*+,./:;<=>?@[]^_`{|}~"';
const VALUES = alphabetIndex(ALPHABET);

/**
 * basE91 (Joachim Henke, 2005): 13 or 14 bits per two characters from the 91 printable ASCII
 * characters other than `-`, `\` and `'`, about 23% overhead. This follows the reference C
 * implementation, which is the only spec; decoding rejects characters outside the alphabet
 * where the reference skips them.
 */
export const base91 = {
  /**
   * Writes bytes in basE91.
   *
   * @param bytes - Bytes to write.
   * @returns {string} The text.
   */
  encode(bytes: Uint8Array): string {
    let out = "";
    let buffer = 0;
    let held = 0;
    for (const byte of bytes) {
      buffer |= byte << held;
      held += 8;
      if (held > 13) {
        let value = buffer & 8191;
        if (value > 88) {
          buffer >>>= 13;
          held -= 13;
        } else {
          value = buffer & 16383;
          buffer >>>= 14;
          held -= 14;
        }
        out += ALPHABET[value % 91]! + ALPHABET[Math.floor(value / 91)]!;
      }
    }
    if (held > 0) {
      out += ALPHABET[buffer % 91]!;
      if (held > 7 || buffer > 90) out += ALPHABET[Math.floor(buffer / 91)]!;
    }
    return out;
  },

  /**
   * Reads basE91 text.
   *
   * @param text - basE91 text.
   * @returns {Uint8Array} The bytes.
   */
  decode(text: string): Uint8Array {
    const out: number[] = [];
    let pending = -1;
    let buffer = 0;
    let held = 0;
    let index = 0;
    for (const character of text) {
      const digit = VALUES.get(character);
      if (digit === undefined) {
        throw new DecodeError(
          "base91",
          `${named(character)} at index ${index} is not in the alphabet`,
          index,
        );
      }
      index += character.length;
      if (pending < 0) {
        pending = digit;
        continue;
      }
      const value = pending + digit * 91;
      buffer |= value << held;
      held += (value & 8191) > 88 ? 13 : 14;
      do {
        out.push(buffer & 0xff);
        buffer >>>= 8;
        held -= 8;
      } while (held > 7);
      pending = -1;
    }
    if (pending >= 0) out.push((buffer | (pending << held)) & 0xff);
    return Uint8Array.from(out);
  },
} as const;
