import { defineCommand } from "citty";
import { base64 } from "../core/base64.ts";
import { InvalidOptionError, shown } from "../core/errors.ts";
import { hex } from "../core/hex.ts";
import { create } from "../core/registry.ts";
import { readText } from "./shared.ts";

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
  },
  run({ args }) {
    const { bytes, details } = create(args.encoding).decode(readText(args.text));
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
