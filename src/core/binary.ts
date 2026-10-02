import { ASCII_WHITESPACE } from "./bytes.ts";
import { DecodeError, named } from "./errors.ts";

/** Options for binary output. */
export interface BinaryEncodeOptions {
  /** Put a space between bytes. Default: true. */
  separate?: boolean;
}

/**
 * Base2: eight `0` and `1` digits per byte, most significant bit first. Decoding skips ASCII
 * whitespace, so `01001000 01101001` and `0100100001101001` read the same.
 */
export const binary = {
  /**
   * Writes bytes as bits.
   *
   * @param bytes - Bytes to write.
   * @param options - Whether to space the bytes.
   * @returns {string} Eight digits per byte.
   */
  encode(bytes: Uint8Array, options: Readonly<BinaryEncodeOptions> = {}): string {
    const groups = Array.from(bytes, (byte) => byte.toString(2).padStart(8, "0"));
    return groups.join(options.separate === false ? "" : " ");
  },

  /**
   * Reads bits as bytes.
   *
   * @param text - Bits, optionally spaced.
   * @returns {Uint8Array} The bytes.
   */
  decode(text: string): Uint8Array {
    const body = text.replaceAll(ASCII_WHITESPACE, "");
    const stray = body.search(/[^01]/u);
    if (stray !== -1) {
      const character = String.fromCodePoint(body.codePointAt(stray)!);
      throw new DecodeError("binary", `${named(character)} is not a bit`, stray);
    }
    if (body.length % 8 !== 0) {
      throw new DecodeError("binary", `${body.length} bits are not whole bytes`);
    }
    const out = new Uint8Array(body.length / 8);
    for (let index = 0; index < out.length; index++) {
      out[index] = Number.parseInt(body.slice(index * 8, index * 8 + 8), 2);
    }
    return out;
  },
} as const;
