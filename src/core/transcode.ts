import { base64 } from "./base64.ts";
import { utf8 } from "./bytes.ts";
import { charsets, type CodePage } from "./charsets.ts";
import { InvalidOptionError } from "./errors.ts";
import { hex } from "./hex.ts";

/** How text turns into bytes and back: UTF-8, the bytes hex or base64 spell, or a code page. */
export type TextFormat = "utf8" | "hex" | "base64" | CodePage;

/**
 * Reads text into bytes.
 *
 * @param text - The text.
 * @param from - UTF-8, hex, base64 or a code page.
 * @returns {Uint8Array} The bytes.
 */
export function textBytes(text: string, from: TextFormat): Uint8Array {
  if (from === "utf8") return new TextEncoder().encode(text);
  if (from === "hex") return hex.decode(text);
  if (from === "base64") return base64.decode(text);
  return charsets.fromText(text, { codepage: from });
}

/**
 * Writes bytes as text, refusing bytes that are not UTF-8 when `to` is `utf8`.
 *
 * @param bytes - The bytes.
 * @param to - UTF-8, hex, base64 or a code page.
 * @returns {string} The text.
 */
export function bytesText(bytes: Uint8Array, to: TextFormat): string {
  if (to === "hex") return hex.encode(bytes);
  if (to === "base64") return base64.encode(bytes);
  if (to !== "utf8") return charsets.toText(bytes, { codepage: to });
  const text = utf8(bytes);
  if (text === undefined) {
    throw new InvalidOptionError("to", to, "the bytes are not valid UTF-8; use hex or a code page");
  }
  return text;
}
