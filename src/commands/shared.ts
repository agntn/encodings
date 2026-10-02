import { readFileSync } from "node:fs";
import { base64 } from "../core/base64.ts";
import { InvalidOptionError } from "../core/errors.ts";
import { hex } from "../core/hex.ts";

/**
 * Reads a positional argument: `-` means stdin, anything else is the value itself.
 *
 * @param value - The argument as typed.
 * @returns {Uint8Array | string} Stdin's bytes, or the argument.
 */
export function argumentOrStdin(value: string): Uint8Array | string {
  return value === "-" ? new Uint8Array(readFileSync(0)) : value;
}

/**
 * Reads the input of `encode` as `--input-format` says.
 *
 * @param value - Text, or bytes from stdin.
 * @param format - utf8, hex or base64.
 * @returns {Uint8Array | string} What to encode.
 */
export function readInput(value: Uint8Array | string, format: string): Uint8Array | string {
  if (format === "utf8") return value;
  const text = typeof value === "string" ? value : new TextDecoder().decode(value);
  if (format === "hex") return hex.decode(text);
  if (format === "base64") return base64.decode(text);
  throw new InvalidOptionError("input-format", format, "use utf8, hex or base64");
}

/**
 * Reads the text of `decode` and `identify`: stdin loses one trailing line break, as a shell
 * pipe adds it.
 *
 * @param value - The argument as typed.
 * @returns {string} The text.
 */
export function readText(value: string): string {
  const read = argumentOrStdin(value);
  return typeof read === "string" ? read : new TextDecoder().decode(read).replace(/\r?\n$/u, "");
}
