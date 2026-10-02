import { defineCommand } from "citty";
import { InvalidOptionError } from "../core/errors.ts";
import { create } from "../core/registry.ts";
import type { EncodeOptions } from "../core/types.ts";
import { argumentOrStdin, flaggedOptions, integerFlag, readInput } from "./shared.ts";

/** Flags that set encoding options, by the option name they set. */
const OPTION_FLAGS = [
  "prefix",
  "limit",
  "upper",
  "separate",
  "delimiters",
  "alphabet",
  "check",
  "m",
  "symbols",
  "bits",
  "order",
  "sample",
  "multibase",
  "padding",
  "name",
  "mode",
] as const;

/**
 * Reads `--limit` as an integer.
 *
 * @param value - The flag as citty parsed it.
 * @returns {number} The limit.
 */
function limitFlag(value: unknown): number {
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 8) {
    throw new InvalidOptionError("limit", value, "must be an integer of at least 8");
  }
  return limit;
}

/**
 * Reads the flags that take numbers: `--limit` and `--bits`.
 *
 * @param name - Option name.
 * @param value - The flag as citty parsed it.
 * @returns {string | number | boolean} The option value.
 */
function typedFlag(name: string, value: string | boolean): string | number | boolean {
  if (name === "limit") return limitFlag(value);
  return name === "bits" ? integerFlag(name, value) : value;
}

export default defineCommand({
  meta: {
    name: "encode",
    description: "Write text or bytes in an encoding",
  },
  args: {
    encoding: {
      type: "positional",
      description: "Encoding, such as base64, base58 or bech32 (encodings list)",
      required: true,
    },
    input: {
      type: "positional",
      description: "Text to encode, or - for stdin byte for byte",
      required: true,
    },
    "input-format": {
      type: "string",
      description: "How to read the input: utf8, or hex and base64 for the bytes they spell",
      default: "utf8",
    },
    prefix: { type: "string", description: "bech32: human-readable part, such as bc" },
    limit: { type: "string", description: "bech32: longest result (default 90)" },
    m: { type: "boolean", description: "bech32: Bech32m checksum (segwit v1+)" },
    upper: { type: "boolean", description: "hex: write A-F" },
    separate: { type: "boolean", description: "binary: space between bytes (default true)" },
    symbols: {
      type: "string",
      description: "binary: the characters for 0 and 1 (default 01). base256: the table",
    },
    bits: { type: "string", description: "binary: bits per byte, 1 to 8 (default 8)" },
    order: { type: "string", description: "binary: msb or lsb first (default msb)" },
    sample: {
      type: "string",
      description: "base256: text whose symbols, in order of first appearance, make the table",
    },
    multibase: { type: "boolean", description: "base256: the 🚀 multibase prefix" },
    alphabet: {
      type: "string",
      description: "base32, base58, base64, base85, base256: alphabet (encodings list <encoding>)",
    },
    check: { type: "boolean", description: "base58: Base58Check, with a double SHA-256 checksum" },
    delimiters: { type: "boolean", description: "base85 --alphabet ascii85: wrap in <~ and ~>" },
    padding: { type: "boolean", description: "base32, base64: pad with = (default true)" },
    name: { type: "string", description: "uuencode: file name on the begin line" },
    mode: { type: "string", description: "uuencode: octal mode on the begin line" },
  },
  run({ args, rawArgs }) {
    const encoding = create(args.encoding);
    const typed = flaggedOptions(
      encoding.name,
      encoding.info().options.map((option) => option.name),
      OPTION_FLAGS,
      args,
      rawArgs,
    );
    const options: EncodeOptions = Object.fromEntries(
      Object.entries(typed).map(([name, value]) => [name, typedFlag(name, value)]),
    );
    const input = readInput(argumentOrStdin(args.input), args["input-format"]);
    const text = encoding.encode(input, options);
    process.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
  },
});
