import { defineCommand } from "citty";
import { base64 } from "../core/base64.ts";
import { InvalidOptionError, shown } from "../core/errors.ts";
import { hex } from "../core/hex.ts";
import { create } from "../core/registry.ts";
import { flaggedOptions, readText } from "./shared.ts";

/** Flags that set decode options, by the option name they set. */
const OPTION_FLAGS = ["hex", "url"] as const;

export default defineCommand({
  meta: {
    name: "decode",
    description: "Read text in an encoding back into bytes",
  },
  args: {
    encoding: {
      type: "positional",
      description: "Encoding, such as base64, base58check or bech32 (encodings list)",
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
    hex: { type: "boolean", description: "base32: extended hex alphabet 0-9 A-V" },
    url: { type: "boolean", description: "base64: - and _ for + and /" },
  },
  run({ args, rawArgs }) {
    const encoding = create(args.encoding);
    const reading = encoding
      .info()
      .options.filter((option) => option.decode === true)
      .map((option) => option.name);
    const options = flaggedOptions(encoding.name, reading, OPTION_FLAGS, args, rawArgs);
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
