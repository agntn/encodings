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

/**
 * Reads the option flags the user typed. A flag left out stays out, so the encoding's own
 * default applies, and a flag the encoding does not take fails instead of being ignored.
 *
 * @param encoding - Registry name, for the error.
 * @param declared - Option names the encoding takes in this direction.
 * @param flags - Option flags the command defines.
 * @param args - Parsed arguments.
 * @param rawArgs - Arguments as typed.
 * @returns {Record<string, string | boolean>} The typed flags by option name, as citty parsed them.
 */
export function flaggedOptions(
  encoding: string,
  declared: readonly string[],
  flags: readonly string[],
  args: Readonly<Record<string, unknown>>,
  rawArgs: readonly string[],
): Record<string, string | boolean> {
  const typed = flags.filter((name) =>
    rawArgs.some(
      (raw) => raw === `--${name}` || raw === `--no-${name}` || raw.startsWith(`--${name}=`),
    ),
  );
  const options: Record<string, string | boolean> = {};
  for (const name of typed) {
    if (!declared.includes(name)) {
      throw new InvalidOptionError(name, args[name], `${encoding} does not take it`);
    }
    options[name] = args[name] as string | boolean;
  }
  return options;
}

/**
 * Reads an integer flag, which citty hands over as a string.
 *
 * @param name - Option name, for the error.
 * @param value - The flag as citty parsed it.
 * @returns {number} The integer.
 */
export function integerFlag(name: string, value: unknown): number {
  if (!/^\d+$/u.test(String(value)))
    throw new InvalidOptionError(name, value, "must be an integer");
  return Number(value);
}
