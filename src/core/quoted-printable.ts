import { DecodeError } from "./errors.ts";

/** Longest encoded line, `=` of a soft break included (RFC 2045 §6.7 rule 5). */
const LINE_LENGTH = 76;

const HEX = "0123456789ABCDEF";
const LF = 0x0a;
const CR = 0x0d;
const SPACE = 0x20;
const TAB = 0x09;
const EQUALS = 0x3d;

/**
 * One byte as `=XX`.
 *
 * @param byte - The byte.
 * @returns {string} Its escape.
 */
function escape(byte: number): string {
  return `=${HEX[byte >> 4]!}${HEX[byte & 15]!}`;
}

/**
 * Whether a line break starts at an index: LF, or CR followed by LF.
 *
 * @param bytes - The input.
 * @param index - Where to look.
 * @returns {number} Length of the break there, 0 for none.
 */
function lineBreakAt(bytes: Uint8Array, index: number): number {
  if (bytes[index] === LF) return 1;
  return bytes[index] === CR && bytes[index + 1] === LF ? 2 : 0;
}

/**
 * How one byte is written: as itself when it is printable and safe, as an escape otherwise. A
 * space or tab before a line break or the end is escaped, so no transport can strip it.
 *
 * @param bytes - The input.
 * @param index - Index of the byte.
 * @returns {string} The byte's token.
 */
function token(bytes: Uint8Array, index: number): string {
  const byte = bytes[index]!;
  if (byte === SPACE || byte === TAB) {
    const atLineEnd = index + 1 === bytes.length || lineBreakAt(bytes, index + 1) > 0;
    return atLineEnd ? escape(byte) : String.fromCodePoint(byte);
  }
  return byte >= 33 && byte <= 126 && byte !== EQUALS ? String.fromCodePoint(byte) : escape(byte);
}

/**
 * Reads one line's characters, escapes resolved, into bytes.
 *
 * @param body - The line without its break, soft `=` and trailing whitespace.
 * @param number - Line number, for errors.
 * @returns {number[]} The bytes.
 */
function decodeLine(body: string, number: number): number[] {
  const out: number[] = [];
  for (let index = 0; index < body.length; index++) {
    const code = body.codePointAt(index)!;
    if (code === EQUALS) {
      const pair = body.slice(index + 1, index + 3);
      if (!/^[0-9A-Fa-f]{2}$/u.test(pair)) {
        throw new DecodeError(
          "quoted-printable",
          `"=" at index ${index} of line ${number} is not followed by two hex digits`,
        );
      }
      out.push(Number.parseInt(pair, 16));
      index += 2;
    } else if (code > 126 || (code < 32 && code !== TAB && code !== CR)) {
      // A lone CR should be escaped, but encoders such as Python's quopri leave it bare.
      throw new DecodeError(
        "quoted-printable",
        `character code ${code} on line ${number} must be escaped`,
      );
    } else {
      out.push(code);
    }
  }
  return out;
}

/**
 * Quoted-Printable (RFC 2045 §6.7), the MIME transfer encoding for mostly-ASCII text: printable
 * ASCII stays, other bytes and `=` become `=XX`, and lines longer than 76 characters break with
 * a trailing `=`. Line breaks in the input (LF or CRLF) stay line breaks, written as they came;
 * soft breaks are written as LF. A space or tab before a line break is escaped so a mail
 * transport cannot strip it.
 */
export const quotedPrintable = {
  /**
   * Writes bytes as Quoted-Printable.
   *
   * @param bytes - Bytes to write.
   * @returns {string} The text.
   */
  encode(bytes: Uint8Array): string {
    let out = "";
    let lineLength = 0;
    for (let index = 0; index < bytes.length; index++) {
      const lineBreak = lineBreakAt(bytes, index);
      if (lineBreak > 0) {
        out += lineBreak === 2 ? "\r\n" : "\n";
        lineLength = 0;
        index += lineBreak - 1;
        continue;
      }
      const next = token(bytes, index);
      if (lineLength + next.length > LINE_LENGTH - 1) {
        out += "=\n";
        lineLength = 0;
      }
      out += next;
      lineLength += next.length;
    }
    return out;
  },

  /**
   * Reads Quoted-Printable text. Escapes take either case of hex digit; whitespace at the end of
   * a line is dropped, as RFC 2045 requires of a decoder.
   *
   * @param text - Quoted-Printable text.
   * @returns {Uint8Array} The bytes.
   */
  decode(text: string): Uint8Array {
    const out: number[] = [];
    const parts = text.split(/(\r?\n)/u);
    for (let part = 0; part < parts.length; part += 2) {
      const line = parts[part]!.replace(/[\t ]+$/u, "");
      // An escape ends in a hex digit, so a trailing `=` is always a soft break.
      const soft = line.endsWith("=");
      // One line can hold any number of bytes, too many to spread into one push call.
      for (const byte of decodeLine(soft ? line.slice(0, -1) : line, part / 2 + 1)) out.push(byte);
      const lineBreak = parts[part + 1];
      if (lineBreak !== undefined && !soft) {
        for (const character of lineBreak) out.push(character.codePointAt(0)!);
      }
    }
    return Uint8Array.from(out);
  },
} as const;
