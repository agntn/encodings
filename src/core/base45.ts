import { TextWriter, alphabetIndex } from "./bytes.ts";
import { DecodeError, named } from "./errors.ts";

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
const VALUES = alphabetIndex(ALPHABET);

/**
 * Base45 (RFC 9285): each two bytes as three characters, least significant first, from an
 * alphabet that fits the alphanumeric mode of a QR code. EU Digital COVID Certificates use it.
 * The space is part of the alphabet, so decoding skips nothing.
 */
export const base45 = {
  /**
   * Writes bytes in base45.
   *
   * @param bytes - Bytes to write.
   * @returns {string} Three characters per two bytes, two for a last odd byte.
   */
  encode(bytes: Uint8Array): string {
    const out = new TextWriter(Math.ceil((bytes.length * 3) / 2));
    for (let index = 0; index + 1 < bytes.length; index += 2) {
      const value = bytes[index]! * 256 + bytes[index + 1]!;
      out.point(ALPHABET.codePointAt(value % 45)!);
      out.point(ALPHABET.codePointAt(Math.floor(value / 45) % 45)!);
      out.point(ALPHABET.codePointAt(Math.floor(value / 2025))!);
    }
    if (bytes.length % 2 === 1) {
      const value = bytes.at(-1)!;
      out.point(ALPHABET.codePointAt(value % 45)!);
      out.point(ALPHABET.codePointAt(Math.floor(value / 45))!);
    }
    return out.toString();
  },

  /**
   * Reads base45 text.
   *
   * @param text - Base45 text.
   * @returns {Uint8Array} The bytes.
   */
  decode(text: string): Uint8Array {
    const digits: number[] = [];
    let index = 0;
    for (const character of text) {
      const value = VALUES.get(character);
      if (value === undefined) {
        throw new DecodeError(
          "base45",
          `${named(character)} at index ${index} is not in the alphabet`,
          index,
        );
      }
      digits.push(value);
      index += character.length;
    }
    if (digits.length % 3 === 1) {
      throw new DecodeError("base45", `${digits.length} characters leave one without a pair`);
    }
    const out = new Uint8Array(
      Math.floor(digits.length / 3) * 2 + (digits.length % 3 === 2 ? 1 : 0),
    );
    let written = 0;
    for (let group = 0; group < digits.length; group += 3) {
      const [c, d, e] = digits.slice(group, group + 3) as [number, number, number?];
      if (e === undefined) {
        const value = c + d * 45;
        if (value > 0xff) {
          throw new DecodeError("base45", `last pair at index ${group} is ${value}, over 255`);
        }
        out[written++] = value;
      } else {
        const value = c + d * 45 + e * 2025;
        if (value > 0xffff) {
          throw new DecodeError("base45", `triple at index ${group} is ${value}, over 65535`);
        }
        out[written++] = value >> 8;
        out[written++] = value & 0xff;
      }
    }
    return out;
  },
} as const;
