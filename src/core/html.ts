import { requireBytes, requireText, toBytes } from "./bytes.ts";
import { EncodingError, named } from "./errors.ts";
import { LEGACY_NAMES, NAMED_REFERENCES } from "./html-references.ts";
import { WINDOWS1252_C1 } from "./windows1252.ts";

/** Options for writing HTML references. */
export interface HtmlOptions {
  /** Also write every character past ASCII as a reference, such as `&#xE9;`. Default: false. */
  readonly ascii?: boolean;
}

/** A hex or decimal reference, or `&` and a name; the `;` is optional for both. */
const REFERENCE = /&(?:#(?:[Xx]([\dA-Fa-f]+)|(\d+))|([\dA-Za-z]+));?/gu;

/** Longest name in `LEGACY_NAMES`. */
const LEGACY_LENGTH = 6;

/** The five characters markup cares about. `&#39;`, not `&apos;`, which HTML 4 never had. */
const ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Keeps a byte order mark as text, so bytes that start with one come back whole. */
const utf8Decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/** U+FFFD, what the parser makes of a number that names no character. */
const REPLACEMENT = String.fromCodePoint(0xff_fd);

let namedTable: Map<string, string> | undefined;
let legacyTable: Set<string> | undefined;

/**
 * The named references by name, built from the table on first use.
 *
 * @returns {Map<string, string>} The text each name stands for.
 */
function namedReferences(): Map<string, string> {
  namedTable ??= new Map(
    NAMED_REFERENCES.trim()
      .split(/\s+/u)
      .map((entry) => {
        const [name = "", points = ""] = entry.split(":");
        const text = String.fromCodePoint(
          ...points.split(",").map((point) => Number.parseInt(point, 16)),
        );
        return [name, text] as const;
      }),
  );
  return namedTable;
}

/**
 * The names that also work without a semicolon.
 *
 * @returns {Set<string>} The names.
 */
function legacyNames(): Set<string> {
  legacyTable ??= new Set(LEGACY_NAMES.trim().split(/\s+/u));
  return legacyTable;
}

/**
 * The code point a numeric reference names, without parsing a million leading zeros.
 *
 * @param digits - The digits after `&#` or `&#x`.
 * @param radix - 16 or 10.
 * @returns {number} The code point, or Infinity when it is too large to hold one.
 */
function codePoint(digits: string, radix: number): number {
  const significant = digits.replace(/^0+/u, "");
  if (significant.length > 8) return Number.POSITIVE_INFINITY;
  return significant === "" ? 0 : Number.parseInt(significant, radix);
}

/**
 * The character a numeric reference stands for. 0x80 to 0x9F go through Windows-1252.
 *
 * @param point - The code point the digits name.
 * @returns {string} The character.
 */
function numeric(point: number): string {
  if (point === 0 || point > 0x10_ff_ff || (point >= 0xd8_00 && point <= 0xdf_ff))
    return REPLACEMENT;
  if (point >= 0x80 && point <= 0x9f) return WINDOWS1252_C1[point - 0x80]!;
  return String.fromCodePoint(point);
}

/**
 * A hex reference for one character, refusing a C1 control HTML would read back as another.
 *
 * @param character - One code point past ASCII.
 * @returns {string} Such as `&#xE9;`.
 */
function hexReference(character: string): string {
  const point = character.codePointAt(0)!;
  const reference = `&#x${point.toString(16).toUpperCase()};`;
  const read = numeric(point);
  if (read !== character) {
    throw new EncodingError(
      `html: ${named(character)} has no reference that reads back as itself; HTML reads ${reference} as ${named(read)}, so encode it without ascii`,
    );
  }
  return reference;
}

/**
 * Reads a named reference. Without `;` the longest legacy prefix wins: `&copy2001` is ©2001.
 *
 * @param reference - The reference as written, `&` included.
 * @param name - The letters and digits after `&`.
 * @returns {string} What it stands for, or the reference itself when it names nothing.
 */
function namedReference(reference: string, name: string): string {
  const semicolon = reference.endsWith(";");
  const whole = semicolon ? namedReferences().get(name) : undefined;
  if (whole !== undefined) return whole;
  for (let length = Math.min(name.length, LEGACY_LENGTH); length > 1; length--) {
    const prefix = name.slice(0, length);
    if (legacyNames().has(prefix)) {
      return `${namedReferences().get(prefix)!}${reference.slice(length + 1)}`;
    }
  }
  return reference;
}

/**
 * HTML character references, `&amp;` to `&#x1F600;`. Decoding reads them the way a browser
 * reads text content, missing semicolons and all.
 */
export const html = {
  /**
   * Writes UTF-8 bytes as HTML text: `&`, `<`, `>`, `"` and `'` become references.
   *
   * @param bytes - UTF-8 text as bytes.
   * @param options - Whether to write characters past ASCII as references too.
   * @returns {string} The text.
   */
  encode(bytes: Uint8Array, options: HtmlOptions = {}): string {
    requireBytes("html: encode", bytes);
    let text: string;
    try {
      text = utf8Decoder.decode(bytes);
    } catch {
      throw new EncodingError(
        "html: encode takes UTF-8 text, and these bytes aren't valid UTF-8; a reference names a character, never a raw byte",
      );
    }
    const pattern = options.ascii === true ? /[&<>"']|[^\0-\x7F]/gu : /[&<>"']/gu;
    return text.replaceAll(pattern, (character) => ESCAPES[character] ?? hexReference(character));
  },

  /**
   * Reads HTML text. Anything that isn't a reference stays as written, like the `&` in `AT&T`.
   *
   * @param text - HTML text.
   * @returns {Uint8Array} The text as UTF-8.
   */
  decode(text: string): Uint8Array {
    requireText("html: decode", text);
    const decoded = text.replaceAll(
      REFERENCE,
      (
        reference,
        hex: string | undefined,
        decimal: string | undefined,
        name: string | undefined,
      ) => {
        if (hex !== undefined) return numeric(codePoint(hex, 16));
        if (decimal !== undefined) return numeric(codePoint(decimal, 10));
        return namedReference(reference, name ?? "");
      },
    );
    return toBytes(decoded);
  },
} as const;
