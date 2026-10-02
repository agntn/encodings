import { DecodeError, InvalidOptionError, named } from "./errors.ts";

/** Options for uuencode output. */
export interface UuencodeOptions {
  /** File name on the `begin` line. Default: `data`. */
  name?: string;
  /** Unix permissions on the `begin` line, three or four octal digits. Default: `644`. */
  mode?: string;
}

/** Bytes per line, the most one length character can announce in practice. */
const LINE_BYTES = 45;

/**
 * One 6-bit value as a uuencode character. Zero is written as a backtick, not a space, as GNU
 * sharutils and most encoders do, so trailing spaces cannot be lost.
 *
 * @param value - 0 to 63.
 * @returns {string} The character.
 */
function character(value: number): string {
  return value === 0 ? "`" : String.fromCodePoint(32 + value);
}

/**
 * One uuencode character as its 6-bit value; space and backtick both read as zero.
 *
 * @param char - The character.
 * @returns {number} The value, or -1 outside the range.
 */
function value(char: string): number {
  const code = char.codePointAt(0) ?? 0;
  if (code < 32 || code > 96) return -1;
  return (code - 32) & 63;
}

/**
 * Writes one line: its length, then each three bytes as four characters.
 *
 * @param line - Up to 45 bytes.
 * @returns {string} The line without its break.
 */
function encodeLine(line: Uint8Array): string {
  let out = character(line.length);
  for (let index = 0; index < line.length; index += 3) {
    const a = line[index]!;
    const b = line[index + 1] ?? 0;
    const c = line[index + 2] ?? 0;
    out += character(a >> 2) + character(((a & 3) << 4) | (b >> 4));
    out += character(((b & 15) << 2) | (c >> 6)) + character(c & 63);
  }
  return out;
}

/**
 * Reads one body line into bytes.
 *
 * @param entry - The line.
 * @param number - Its line number, for errors.
 * @returns {number[]} The bytes it announces.
 */
function decodeLine(entry: string, number: number): number[] {
  const length = value(entry[0]!);
  if (length < 0) {
    throw new DecodeError("uuencode", `line ${number} starts with ${named(entry[0]!)}`);
  }
  if (entry.length - 1 < Math.ceil((length * 4) / 3)) {
    throw new DecodeError(
      "uuencode",
      `line ${number} announces ${length} bytes but carries ${entry.length - 1} characters`,
    );
  }
  const needed = Math.ceil(length / 3) * 4;
  const body = entry.slice(1, 1 + needed).padEnd(needed, " ");
  const out: number[] = [];
  for (let index = 0; index < body.length; index += 4) {
    const quad = [0, 1, 2, 3].map((offset) => value(body[index + offset]!));
    const bad = quad.findIndex((entryValue) => entryValue < 0);
    if (bad !== -1) {
      throw new DecodeError(
        "uuencode",
        `${named(body[index + bad]!)} on line ${number} is not a uuencode character`,
      );
    }
    const [a, b, c, d] = quad as [number, number, number, number];
    out.push((a << 2) | (b >> 4), ((b & 15) << 4) | (c >> 2), ((c & 3) << 6) | d);
  }
  return out.slice(0, length);
}

/**
 * Finds the first body line: the one after `begin`, or the first line when there is none.
 *
 * @param lines - The text's lines.
 * @returns {number} Index of the first body line.
 */
function bodyStart(lines: readonly string[]): number {
  const begin = lines.findIndex((entry) => /^begin(?:-base64)? [0-7]{3,4} /u.test(entry));
  if (begin !== -1 && lines[begin]!.startsWith("begin-base64")) {
    throw new DecodeError("uuencode", "a begin-base64 file is base64, not uuencode");
  }
  return begin + 1;
}

/**
 * uuencode, the Unix-to-Unix encoding of `uuencode(1)` and POSIX `uudecode`: a `begin` line,
 * lines of up to 45 bytes each led by its length, a backtick line, then `end`. Decoding takes
 * the text with or without the `begin` and `end` lines and returns the bytes of the first file.
 */
export const uuencode = {
  /**
   * Writes bytes as a uuencoded file.
   *
   * @param bytes - Bytes to write.
   * @param options - Name and mode on the `begin` line.
   * @returns {string} The text, ending in a line break.
   */
  encode(bytes: Uint8Array, options: Readonly<UuencodeOptions> = {}): string {
    const { name = "data", mode = "644" } = options;
    if (!/^[0-7]{3,4}$/u.test(mode)) {
      throw new InvalidOptionError("mode", mode, "use three or four octal digits, such as 644");
    }
    if (name.length === 0 || /[\p{Cc}\p{Zl}\p{Zp}]/u.test(name)) {
      throw new InvalidOptionError("name", name, "must be one non-empty line");
    }
    const lines = [`begin ${mode} ${name}`];
    for (let start = 0; start < bytes.length; start += LINE_BYTES) {
      lines.push(encodeLine(bytes.subarray(start, start + LINE_BYTES)));
    }
    return `${[...lines, "`", "end"].join("\n")}\n`;
  },

  /**
   * Reads a uuencoded file.
   *
   * @param text - The text, with or without its `begin` and `end` lines.
   * @returns {Uint8Array} The bytes.
   */
  decode(text: string): Uint8Array {
    const lines = text.split(/\r?\n/u);
    const start = bodyStart(lines);
    const end = lines.indexOf("end", start);
    if (start > 0 && end === -1) throw new DecodeError("uuencode", 'no "end" line after "begin"');
    const out: number[] = [];
    for (let line = start; line < (end === -1 ? lines.length : end); line++) {
      const entry = lines[line]!;
      if (entry === "" || value(entry[0]!) === 0) continue;
      out.push(...decodeLine(entry, line + 1));
    }
    return Uint8Array.from(out);
  },
} as const;
