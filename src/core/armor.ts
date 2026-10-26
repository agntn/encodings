import { base64 } from "./base64.ts";
import { equalBytes, requireBytes, requireText } from "./bytes.ts";
import { DecodeError, InvalidOptionError, shown } from "./errors.ts";

/** Base64 characters a line, as GnuPG writes them and as the samples in RFC 9580 appendix A do. */
const LINE_LENGTH = 64;

/** What may follow `BEGIN PGP `: capitals, digits, and spaces, commas or slashes inside. */
const LABEL_TEXT = "[A-Z0-9](?:[A-Z0-9 ,/]*[A-Z0-9])?";
const LABEL = new RegExp(`^${LABEL_TEXT}$`, "u");
const BEGIN = new RegExp(`^-----BEGIN PGP (${LABEL_TEXT})-----$`, "u");

/** A header: a name of printable ASCII but no colon, which base64 never holds either. */
const HEADER = /^([!-9;-~]+): ?(.*)$/su;

/** What mail adds or strips around a line. Unicode spaces stay, they can be header text. */
const PADDING = new Set([" ", "\t", "\f", "\r"]);

/** Longest stray line an error quotes, about twice an armor line with a long label. */
const SHOWN_LINE = 80;

/** The cleartext signature frame (RFC 9580 §7). Not armor, though its SIGNATURE block is. */
const CLEARTEXT = "SIGNED MESSAGE";

/** One armor header, name and value, such as `["Comment", "made by hand"]`. */
export type ArmorHeader = readonly [name: string, value: string];

/** What the CRC24 footer said: it matched the data, it did not, or there was none. */
export type ArmorChecksum = "match" | "mismatch" | "absent";

/** One armor block as read. */
export interface ArmorBlock {
  /** What follows `BEGIN PGP `, such as `PUBLIC KEY BLOCK`. */
  readonly label: string;
  /** Armor headers in the order they came, a repeated name repeated. */
  readonly headers: readonly ArmorHeader[];
  /** The bytes under the armor. */
  readonly bytes: Uint8Array;
  /** What the CRC24 footer said, never a reason to throw (RFC 9580 §6.1). */
  readonly checksum: ArmorChecksum;
}

/** Options of `armor.encode`. */
export interface ArmorEncodeOptions {
  /** What follows `BEGIN PGP `, such as `MESSAGE` or `PUBLIC KEY BLOCK`. */
  label: string;
  /** Header lines to write above the data, in this order. */
  headers?: readonly ArmorHeader[];
  /** Write the CRC24 footer, which RFC 9580 says to leave out unless an old reader needs it. */
  checksum?: boolean;
}

/** Options of `armor.decode`. */
export interface ArmorDecodeOptions {
  /** Read only a block with this label, skipping any other. */
  label?: string;
}

/** The options of `encode` once checked, headers already written as lines. */
interface EncodeSettings {
  readonly label: string;
  readonly headers: string[];
  readonly checksum: boolean;
}

/** Where the BEGIN line of a block sits and what it says. */
interface Begin {
  readonly index: number;
  readonly label: string;
}

/** The armor headers of a block and the index of the first line after them. */
interface Headers {
  readonly headers: ArmorHeader[];
  readonly next: number;
}

/** The joined base64 of a block and the text after `=` on its checksum line, if it has one. */
interface Body {
  readonly data: string;
  readonly footer: string | undefined;
}

/**
 * The CRC24 of RFC 9580 §6.1.1: generator 0x864CFB, starting from 0xB704CE.
 *
 * @param bytes - The data under the armor.
 * @returns {Uint8Array} The three checksum bytes, high byte first.
 */
function crc24(bytes: Uint8Array): Uint8Array {
  let crc = 0xb704ce;
  for (const byte of bytes) {
    crc ^= byte << 16;
    for (let bit = 0; bit < 8; bit++) {
      crc <<= 1;
      if (crc & 0x1000000) crc ^= 0x1864cfb;
    }
  }
  return Uint8Array.of((crc >>> 16) & 0xff, (crc >>> 8) & 0xff, crc & 0xff);
}

/**
 * Checks a label the caller passed.
 *
 * @param label - The label, typed or not.
 * @returns {string} The same label.
 * @throws {InvalidOptionError} When it is not a label, or names the cleartext frame.
 */
function checkLabel(label: unknown): string {
  if (typeof label !== "string" || !LABEL.test(label)) {
    throw new InvalidOptionError(
      "label",
      label,
      "a label is what follows BEGIN PGP, in capitals, such as MESSAGE or PUBLIC KEY BLOCK",
    );
  }
  if (label.startsWith("PGP ")) {
    throw new InvalidOptionError(
      "label",
      label,
      `PGP is already written, pass ${shown(label.slice(4))}`,
    );
  }
  if (label === CLEARTEXT) {
    throw new InvalidOptionError(
      "label",
      label,
      "a cleartext signed message is not armor, its SIGNATURE block is",
    );
  }
  return label;
}

/**
 * Writes one header as its line, refusing anything that would break the block apart.
 *
 * @param header - Name and value.
 * @returns {string} The line, `Name: value`.
 * @throws {InvalidOptionError} When the name has a colon or space, or the value breaks or trails.
 */
function headerLine(header: ArmorHeader): string {
  const [name, value] = header;
  if (typeof name !== "string" || !/^[!-9;-~]+$/u.test(name)) {
    throw new InvalidOptionError("headers", name, "a header name is printable ASCII, no colon");
  }
  if (typeof value !== "string" || /[\n\r]|[\t\f ]$/u.test(value)) {
    throw new InvalidOptionError(
      "headers",
      value,
      "a header value is one line of text, and mail strips a space or tab at its end",
    );
  }
  return `${name}: ${value}`;
}

/**
 * Turns the header option into lines, after checking it is a list.
 *
 * @param headers - The option as passed.
 * @returns {string[]} One line per header.
 * @throws {InvalidOptionError} When it is not a list of pairs.
 */
function headerLines(headers: readonly ArmorHeader[] | undefined): string[] {
  if (headers === undefined) return [];
  const value: unknown = headers;
  if (!Array.isArray(value)) {
    throw new InvalidOptionError("headers", value, "headers are a list of [name, value] pairs");
  }
  return headers.map((header) => headerLine(header));
}

/**
 * Checks the options of `encode`, which a caller without types may leave out entirely.
 *
 * @param options - The options as passed.
 * @returns {EncodeSettings} The label, header lines and footer switch.
 * @throws {InvalidOptionError} When the label is missing or an option is invalid.
 */
function encodeOptions(options: Readonly<ArmorEncodeOptions> | undefined): EncodeSettings {
  const checksum = options?.checksum ?? false;
  if (typeof checksum !== "boolean") {
    throw new InvalidOptionError("checksum", checksum, "expected true or false");
  }
  return { label: checkLabel(options?.label), headers: headerLines(options?.headers), checksum };
}

/**
 * Cuts ASCII padding off both ends of a line, with no regex to go quadratic on a long one.
 *
 * @param line - One line of input.
 * @returns {string} The line without its padding.
 */
function unpad(line: string): string {
  let start = 0;
  let end = line.length;
  while (start < end && PADDING.has(line[start]!)) start++;
  while (end > start && PADDING.has(line[end - 1]!)) end--;
  return line.slice(start, end);
}

/**
 * Cuts base64 into lines of `LINE_LENGTH`.
 *
 * @param data - The base64.
 * @returns {string[]} The lines, none for empty data.
 */
function wrap(data: string): string[] {
  const lines: string[] = [];
  for (let start = 0; start < data.length; start += LINE_LENGTH) {
    lines.push(data.slice(start, start + LINE_LENGTH));
  }
  return lines;
}

/**
 * Reads the label off a BEGIN line, skipping the cleartext frame.
 *
 * @param line - One trimmed line.
 * @returns {string | undefined} The label, or `undefined` when the line opens no armor.
 */
function beginLabel(line: string): string | undefined {
  const label = BEGIN.exec(line)?.[1];
  return label === CLEARTEXT ? undefined : label;
}

/**
 * Finds the first BEGIN line of a block worth reading.
 *
 * @param lines - The input, one trimmed line each.
 * @param wanted - The label asked for, or `undefined` for any block.
 * @returns {Begin} Where the block starts and its label.
 * @throws {DecodeError} When no such block is there.
 */
function findBegin(lines: readonly string[], wanted: string | undefined): Begin {
  let other: string | undefined;
  for (const [index, line] of lines.entries()) {
    const label = beginLabel(line);
    if (label === undefined) continue;
    if (wanted === undefined || label === wanted) return { index, label };
    other ??= label;
  }
  const missing = `no -----BEGIN PGP ${wanted ?? "..."}----- line`;
  throw new DecodeError("armor", other === undefined ? missing : `${missing}, only ${other}`);
}

/**
 * Reads headers up to the blank line, or up to the first data line when the blank line got lost.
 *
 * @param lines - The input, one trimmed line each.
 * @param start - Index of the line after BEGIN.
 * @returns {Headers} The headers and where the data starts.
 */
function readHeaders(lines: readonly string[], start: number): Headers {
  const headers: ArmorHeader[] = [];
  for (let index = start; index < lines.length; index++) {
    const line = lines[index]!;
    if (line === "") return { headers, next: index + 1 };
    const header = HEADER.exec(line);
    if (header === null) return { headers, next: index };
    headers.push([header[1]!, header[2]!]);
  }
  return { headers, next: lines.length };
}

/**
 * Names a stray dashed line for an error, by its length once it is too long to quote.
 *
 * @param line - The trimmed line.
 * @returns {string} The line itself, or its length.
 */
function foreignLine(line: string): string {
  return line.length > SHOWN_LINE ? `a line of ${line.length} characters` : shown(line);
}

/**
 * Collects the base64 up to the END line, and the checksum line right before it.
 *
 * @param lines - The input, one trimmed line each.
 * @param start - Index of the first data line.
 * @param end - The END line this block needs.
 * @returns {Body} The base64 and the checksum text.
 * @throws {DecodeError} When the END line is missing or something sits between the checksum and it.
 */
function readBody(lines: readonly string[], start: number, end: string): Body {
  const data: string[] = [];
  let footer: string | undefined;
  for (let index = start; index < lines.length; index++) {
    const line = lines[index]!;
    if (line === end) return { data: data.join(""), footer };
    if (line === "") continue;
    if (footer !== undefined) {
      throw new DecodeError("armor", `the checksum line must sit right above ${end}`);
    }
    if (line.startsWith("-----")) {
      throw new DecodeError("armor", `expected ${end}, found ${foreignLine(line)}`);
    }
    if (line.startsWith("=")) footer = line.slice(1);
    else data.push(line);
  }
  throw new DecodeError("armor", `no ${end} line after the data`);
}

/**
 * Decodes the base64 of a block, with the base64 complaint kept.
 *
 * @param data - The joined data lines.
 * @returns {Uint8Array} The bytes.
 * @throws {DecodeError} When the data is not base64.
 */
function decodeData(data: string): Uint8Array {
  try {
    return base64.decode(data);
  } catch (error) {
    const reason = error instanceof Error ? error.message.replace(/^base64: /u, "") : String(error);
    throw new DecodeError("armor", `the data is not base64: ${reason}`);
  }
}

/**
 * Compares the checksum line with the data. A footer that does not even decode is a mismatch.
 *
 * @param bytes - The decoded data.
 * @param footer - The text after `=`, or `undefined` without a checksum line.
 * @returns {ArmorChecksum} What the footer said.
 */
function checksumOf(bytes: Uint8Array, footer: string | undefined): ArmorChecksum {
  if (footer === undefined) return "absent";
  try {
    return equalBytes(base64.decode(footer), crc24(bytes)) ? "match" : "mismatch";
  } catch {
    return "mismatch";
  }
}

/**
 * OpenPGP ASCII armor (RFC 9580 §6): base64 between a `-----BEGIN PGP <label>-----` line and its
 * END line, with optional `Name: value` headers on top. The CRC24 footer is written only when
 * asked for, and a wrong one never rejects a block, as §6.1 requires: it shows up in `checksum`.
 * The cleartext signed message (§7) is a signing frame, not armor, so `decode` steps over it
 * and reads its SIGNATURE block.
 */
export const armor = {
  /**
   * Wraps bytes in armor, 64 base64 characters a line, without a final line break.
   *
   * @param bytes - The data, usually OpenPGP packets.
   * @param options - The label, plus headers and the CRC24 footer when wanted.
   * @returns {string} The armored block.
   * @throws {EncodingError} When `bytes` are not bytes or an option is invalid.
   */
  encode(bytes: Uint8Array, options: Readonly<ArmorEncodeOptions>): string {
    requireBytes("armor: encode", bytes);
    const { label, headers, checksum } = encodeOptions(options);
    const lines = [`-----BEGIN PGP ${label}-----`, ...headers, "", ...wrap(base64.encode(bytes))];
    if (checksum) lines.push(`=${base64.encode(crc24(bytes))}`);
    lines.push(`-----END PGP ${label}-----`);
    return lines.join("\n");
  },

  /**
   * Reads the first armor block in a text, whatever sits around it.
   *
   * @param text - Text holding the block.
   * @param options - A label to look for, when only one kind of block will do.
   * @returns {ArmorBlock} Label, headers, bytes and what the checksum said.
   * @throws {EncodingError} When there is no block, it is cut short or its data is not base64.
   */
  decode(text: string, options: Readonly<ArmorDecodeOptions> = {}): ArmorBlock {
    requireText("armor: decode", text);
    const wanted = options.label === undefined ? undefined : checkLabel(options.label);
    const lines = text.split(/\r?\n/u).map((line) => unpad(line));
    const { index, label } = findBegin(lines, wanted);
    const { headers, next } = readHeaders(lines, index + 1);
    const { data, footer } = readBody(lines, next, `-----END PGP ${label}-----`);
    const bytes = decodeData(data);
    return { label, headers, bytes, checksum: checksumOf(bytes, footer) };
  },
} as const;
