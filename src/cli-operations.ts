/** What `encode`, `decode` and `convert` do on the command line, loaded on their first call. */

import { readFileSync } from "node:fs";
import type { Static, ToolResult } from "@agntn/tools";
import { base64 } from "./core/base64.ts";
import { InvalidOptionError, shown } from "./core/errors.ts";
import { hex } from "./core/hex.ts";
import { create } from "./core/registry.ts";
import { bytesText, textBytes } from "./core/transcode.ts";
import type { EncodeOptions, Encoding } from "./core/types.ts";
import type { IdentifyDetails } from "./tool-operations.ts";
import {
  decodeFlags,
  encodeFlags,
  type convertSchema,
  type decodeSchema,
  type encodeSchema,
  type identifyCommandSchema,
} from "./cli-commands.ts";

/** Bytes and text these commands write themselves, so `runCli` has nothing left to print. */
const WRITTEN: ToolResult<null> = { content: [], details: null };

/**
 * Reads a positional argument: `-` means stdin, anything else is the value itself.
 *
 * @param value - The argument as typed.
 * @returns {Uint8Array | string} Stdin's bytes, or the argument.
 */
function argumentOrStdin(value: string): Uint8Array | string {
  return value === "-" ? new Uint8Array(readFileSync(0)) : value;
}

/**
 * Reads stdin as text without the line break a pipe adds, or the argument as typed.
 *
 * @param value - The argument as typed.
 * @returns {string} The text.
 */
function readText(value: string): string {
  const read = argumentOrStdin(value);
  return typeof read === "string" ? read : new TextDecoder().decode(read).replace(/\r?\n$/u, "");
}

/**
 * Picks the option flags that were given and refuses one the encoding does not take, so a flag
 * never gets dropped without a word. A flag left out stays out, and the encoding's default holds.
 *
 * @param params - The parsed command line.
 * @param scope - The encoding, the flags the command has and the option names it takes here.
 * @returns {EncodeOptions} The options by name.
 */
function givenOptions(
  params: Readonly<Record<string, unknown>>,
  scope: Readonly<{ encoding: Encoding; flags: readonly string[]; takes: readonly string[] }>,
): EncodeOptions {
  const given = scope.flags.flatMap((name) => {
    const value = params[name];
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean")
      return [];
    if (!scope.takes.includes(name)) {
      throw new InvalidOptionError(name, value, `${scope.encoding.name} does not take it`);
    }
    return [[name, value] as const];
  });
  return Object.fromEntries(given);
}

/**
 * Reads the input of `encode` as `--input-format` says.
 *
 * @param value - Text, or bytes from stdin.
 * @param format - utf8, hex or base64.
 * @returns {Uint8Array | string} What to encode.
 */
function readInput(value: Uint8Array | string, format: string): Uint8Array | string {
  if (format === "utf8") return value;
  const text = typeof value === "string" ? value : new TextDecoder().decode(value);
  return format === "hex" ? hex.decode(text) : base64.decode(text);
}

/**
 * Writes text or bytes in an encoding, one line on stdout.
 *
 * @param params - The parsed command line.
 * @returns {ToolResult<null>} Nothing left to print.
 */
export function encode(params: Readonly<Static<typeof encodeSchema>>): ToolResult<null> {
  const encoding = create(params.encoding);
  const options = givenOptions(params, {
    encoding,
    flags: Object.keys(encodeFlags),
    takes: encoding.info().options.map((option) => option.name),
  });
  const input = readInput(argumentOrStdin(params.input), params.inputFormat ?? "utf8");
  const text = encoding.encode(input, options);
  process.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
  return WRITTEN;
}

/**
 * Reads text back into bytes: raw on stdout, or a hex or base64 line, with any prefix, version
 * or file name the text carried on stderr.
 *
 * @param params - The parsed command line.
 * @returns {ToolResult<null>} Nothing left to print.
 */
export function decode(params: Readonly<Static<typeof decodeSchema>>): ToolResult<null> {
  const encoding = create(params.encoding);
  const options = givenOptions(params, {
    encoding,
    flags: Object.keys(decodeFlags),
    takes: encoding
      .info()
      .options.filter((option) => option.decode === true)
      .map((option) => option.name),
  });
  const { bytes, details } = encoding.decode(readText(params.text), options);
  for (const [key, value] of Object.entries(details))
    process.stderr.write(`${key}: ${shown(value)}\n`);
  const output = params.output ?? "raw";
  if (output === "raw") process.stdout.write(bytes);
  else process.stdout.write(`${output === "hex" ? hex.encode(bytes) : base64.encode(bytes)}\n`);
  return WRITTEN;
}

/**
 * Reads the input of `convert` into bytes. `raw` and `utf8` take stdin byte for byte, the rest
 * read stdin as text without the line break a pipe adds.
 *
 * @param input - The argument, or stdin's bytes.
 * @param from - How to read it.
 * @returns {Uint8Array} The bytes.
 */
function convertBytes(
  input: Uint8Array | string,
  from: Static<typeof convertSchema>["from"],
): Uint8Array {
  if (typeof input === "string") return textBytes(input, from === "raw" ? "utf8" : from);
  if (from === "raw" || from === "utf8") return input;
  return textBytes(new TextDecoder().decode(input).replace(/\r?\n$/u, ""), from);
}

/**
 * Reads text as bytes in one code page and writes them in another, or raw with `--to raw`.
 *
 * @param params - The parsed command line.
 * @returns {ToolResult<null>} Nothing left to print.
 */
export function convert(params: Readonly<Static<typeof convertSchema>>): ToolResult<null> {
  const bytes = convertBytes(argumentOrStdin(params.input), params.from);
  const to = params.to ?? "utf8";
  if (to === "raw") process.stdout.write(bytes);
  else process.stdout.write(`${bytesText(bytes, to)}\n`);
  return WRITTEN;
}

/**
 * Runs `encodings_identify` on the text or stdin. Finding nothing is a failure here, with the
 * tool's line on stderr and exit code 1, so `identify x || ...` works in a script.
 *
 * @param params - The parsed command line.
 * @returns {Promise<ToolResult<IdentifyDetails>>} The tool's answer.
 */
export async function identify(
  params: Readonly<Static<typeof identifyCommandSchema>>,
): Promise<ToolResult<IdentifyDetails>> {
  const { encodingsIdentify } = await import("./tool-operations.ts");
  const result = encodingsIdentify({ ...params, text: readText(params.text) });
  const { candidates, layers = [] } = result.details;
  return candidates.length + layers.length === 0 ? { ...result, isError: true } : result;
}
