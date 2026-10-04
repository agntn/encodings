import { defineCommand } from "citty";
import { base64 } from "../core/base64.ts";
import { InvalidOptionError, shown } from "../core/errors.ts";
import { hex } from "../core/hex.ts";
import { create } from "../core/registry.ts";
import { flaggedOptions, integerFlag, readText } from "./shared.ts";

/** Flags that set decode options, by the option name they set. */
const OPTION_FLAGS = [
  "alphabet",
  "check",
  "m",
  "symbols",
  "bits",
  "order",
  "sample",
  "multibase",
  "canonical",
] as const;

export default defineCommand({
  meta: {
    name: "decode",
    description: "Read text in an encoding back into bytes",
  },
  args: {
    encoding: {
      type: "positional",
      description: "Encoding, such as base64, base58 or bech32 (encodings list)",
      required: true,
    },
    text: {
      type: "positional",
      description: "Encoded text, or - for stdin",
      required: true,
    },
    output: {
      type: "string",
      alias: "o",
      description: "How to write the bytes: raw (default), hex or base64",
      default: "raw",
    },
    alphabet: {
      type: "string",
      description: "base32, base58, base64, base85, base256: alphabet (encodings list <encoding>)",
    },
    check: { type: "boolean", description: "base58: Base58Check, verify and strip the checksum" },
    m: { type: "boolean", description: "bech32: Bech32m checksum (segwit v1+)" },
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
    canonical: {
      type: "boolean",
      description: "base32, base64: refuse non-zero bits after the last byte",
    },
  },
  run({ args, rawArgs }) {
    const encoding = create(args.encoding);
    const reading = encoding
      .info()
      .options.filter((option) => option.decode === true)
      .map((option) => option.name);
    const flagged = flaggedOptions(encoding.name, reading, OPTION_FLAGS, args, rawArgs);
    const options =
      "bits" in flagged ? { ...flagged, bits: integerFlag("bits", flagged["bits"]) } : flagged;
    const { bytes, details } = encoding.decode(readText(args.text), options);
    for (const [key, value] of Object.entries(details))
      process.stderr.write(`${key}: ${shown(value)}\n`);
    if (args.output === "raw") {
      process.stdout.write(bytes);
    } else if (args.output === "hex") {
      process.stdout.write(`${hex.encode(bytes)}\n`);
    } else if (args.output === "base64") {
      process.stdout.write(`${base64.encode(bytes)}\n`);
    } else {
      throw new InvalidOptionError("output", args.output, "use raw, hex or base64");
    }
  },
});
