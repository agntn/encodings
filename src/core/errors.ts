/** Characters that break a line or change how one reads: controls, format characters such as
 * bidi overrides, and the Unicode line and paragraph separators. */
const UNSAFE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
const UNESCAPED_BY_JSON = /[\u0080-\u009F\u2028\u2029\p{Cf}]/gu;

/**
 * Writes text as a JSON string that is safe on one line: JSON escapes C0 controls, and this
 * also escapes C1 controls, U+2028, U+2029 and format characters, which JSON leaves literal.
 *
 * @param text - Any text.
 * @returns {string} The quoted text.
 */
export function quote(text: string): string {
  return JSON.stringify(text).replaceAll(UNESCAPED_BY_JSON, (character) =>
    character
      .split("")
      .map((unit) => `\\u${unit.codePointAt(0)!.toString(16).padStart(4, "0")}`)
      .join(""),
  );
}

/**
 * Shows a caller's value inside an error message. A value with a line break, a control or a
 * format character is quoted: these messages reach a model as they are, and a raw line break
 * would add a line that reads as the tool's own answer. The error's fields keep the raw value.
 *
 * @param value - The value as the caller passed it.
 * @returns {string} The value as it appears in the message.
 */
export function shown(value: unknown): string {
  const text = String(value);
  return UNSAFE.test(text) ? quote(text) : text;
}

/**
 * Names one character for a message by its code point, with the character itself in quotes
 * when it is visible, so a look-alike (Cyrillic `О` for `O`) is still told apart and an
 * invisible or line-breaking one never reaches the message raw.
 *
 * @param character - One code point.
 * @returns {string} Such as `"0" (U+0030)`, or `U+2028` alone.
 */
export function named(character: string): string {
  const point = character.codePointAt(0) ?? 0;
  const code = `U+${point.toString(16).toUpperCase().padStart(4, "0")}`;
  return /^[\p{L}\p{M}\p{N}\p{P}\p{S} ]$/u.test(character)
    ? `${JSON.stringify(character)} (${code})`
    : code;
}

/** Base error for @agntn/encodings. */
export class EncodingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EncodingError";
  }
}

/** Text that is not valid in the encoding it was decoded as. */
export class DecodeError extends EncodingError {
  /** Registry name of the encoding. */
  readonly encoding: string;
  /** Index of the offending character in the decoded text, when one character is at fault. */
  readonly index: number | undefined;

  constructor(encoding: string, message: string, index?: number) {
    super(`${encoding}: ${message}`);
    this.name = "DecodeError";
    this.encoding = encoding;
    this.index = index;
  }
}

/** Text whose characters decode but whose checksum does not match. */
export class ChecksumError extends DecodeError {
  constructor(encoding: string, message = "checksum does not match") {
    super(encoding, message);
    this.name = "ChecksumError";
  }
}

/** Encoding not found in the registry. */
export class UnknownEncodingError extends EncodingError {
  readonly encoding: string;
  /** Names that were registered when the lookup failed. */
  readonly available: readonly string[];

  constructor(encoding: string, available: readonly string[] = []) {
    super(
      available.length > 0
        ? `Unknown encoding: ${shown(encoding)}. Available: ${available.join(", ")}`
        : `Unknown encoding: ${shown(encoding)}`,
    );
    this.name = "UnknownEncodingError";
    this.encoding = encoding;
    this.available = available;
  }
}

/** Invalid option value. */
export class InvalidOptionError extends EncodingError {
  readonly option: string;
  readonly value: unknown;
  readonly reason: string;

  constructor(option: string, value: unknown, reason: string) {
    super(`Invalid option ${shown(option)}=${shown(value)}: ${reason}`);
    this.name = "InvalidOptionError";
    this.option = option;
    this.value = value;
    this.reason = reason;
  }
}

/**
 * Normalizes any thrown value into an EncodingError.
 *
 * @param error - The thrown value.
 * @param encoding - Encoding the failure belongs to, prefixed to a foreign message.
 * @returns {EncodingError} The same error when it already is one, otherwise a wrapped copy.
 */
export function normalizeError(error: unknown, encoding?: string): EncodingError {
  if (error instanceof EncodingError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new EncodingError(encoding ? `[${encoding}] ${message}` : message);
}
