import { defineCommand } from "citty";
import { InvalidOptionError } from "../core/errors.ts";
import { create } from "../core/registry.ts";
import type { EncodeOptions, Encoding } from "../core/types.ts";
import { argumentOrStdin, readInput } from "./shared.ts";

/** Flags that set encoding options, by the option name they set. */
const OPTION_FLAGS = [
  "prefix",
  "limit",
  "upper",
  "separate",
  "delimiters",
  "padding",
  "name",
  "mode",
] as const;

/**
 * Reads the option flags the user typed. A flag left out stays out, so the encoding's own
 * default applies, and a flag the encoding does not take fails instead of being ignored.
 *
 * @param encoding - The encoding.
 * @param args - Parsed arguments.
 * @param rawArgs - Arguments as typed.
 * @returns {EncodeOptions} The options.
 */
function flaggedOptions(
  encoding: Encoding,
  args: Readonly<Record<string, unknown>>,
  rawArgs: readonly string[],
): EncodeOptions {
  const declared = new Set(encoding.info().options.map((option) => option.name));
  const typed = OPTION_FLAGS.filter((name) =>
    rawArgs.some(
      (raw) => raw === `--${name}` || raw === `--no-${name}` || raw.startsWith(`--${name}=`),
    ),
  );
  const options: Record<string, string | number | boolean> = {};
  for (const name of typed) {
    const value = args[name];
    if (!declared.has(name)) {
      throw new InvalidOptionError(name, value, `${encoding.name} does not take it`);
    }
    options[name] = name === "limit" ? limitFlag(value) : (value as string | boolean);
  }
  return options;
}

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

export default defineCommand({
  meta: {
    name: "encode",
    description: "Write text or bytes in an encoding",
  },
  args: {
    encoding: {
      type: "positional",
      description: "Encoding, such as base64, base58check or bech32 (encodings list)",
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
    prefix: { type: "string", description: "bech32, bech32m: human-readable part, such as bc" },
    limit: { type: "string", description: "bech32, bech32m: longest result (default 90)" },
    upper: { type: "boolean", description: "hex: write A-F" },
    separate: { type: "boolean", description: "binary: space between bytes (default true)" },
    delimiters: { type: "boolean", description: "ascii85: wrap in <~ and ~>" },
    padding: { type: "boolean", description: "base32, base32hex: pad with = (default true)" },
    name: { type: "string", description: "uuencode: file name on the begin line" },
    mode: { type: "string", description: "uuencode: octal mode on the begin line" },
  },
  run({ args, rawArgs }) {
    const encoding = create(args.encoding);
    const options = flaggedOptions(encoding, args, rawArgs);
    const input = readInput(argumentOrStdin(args.input), args["input-format"]);
    const text = encoding.encode(input, options);
    process.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
  },
});
