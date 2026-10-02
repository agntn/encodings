import { defineCommand } from "citty";
import { CODE_PAGES } from "../core/charsets.ts";
import { InvalidOptionError } from "../core/errors.ts";
import { bytesText, textBytes } from "../core/transcode.ts";
import { argumentOrStdin } from "./shared.ts";

const FORMATS = ["raw", "utf8", "hex", "base64", ...CODE_PAGES] as const;

type Format = (typeof FORMATS)[number];

/**
 * Checks a `--from` or `--to` value.
 *
 * @param flag - Flag name, for the error.
 * @param value - The value as typed.
 * @returns {Format} The format.
 */
function format(flag: string, value: string): Format {
  const found = FORMATS.find((name) => name === value);
  if (found === undefined) throw new InvalidOptionError(flag, value, `use ${FORMATS.join(", ")}`);
  return found;
}

/**
 * Reads the input into bytes. `raw` and `utf8` take stdin byte for byte; the rest read stdin as
 * text without the line break a pipe adds.
 *
 * @param input - The argument, or stdin's bytes.
 * @param from - How to read it.
 * @returns {Uint8Array} The bytes.
 */
function readBytes(input: Uint8Array | string, from: Format): Uint8Array {
  if (typeof input === "string") return textBytes(input, from === "raw" ? "utf8" : from);
  if (from === "raw" || from === "utf8") return input;
  return textBytes(new TextDecoder().decode(input).replace(/\r?\n$/u, ""), from);
}

export default defineCommand({
  meta: {
    name: "convert",
    description: "Read text as bytes in one code page and write them in another",
  },
  args: {
    input: {
      type: "positional",
      description: "Text to convert, or - for stdin",
      required: true,
    },
    from: {
      type: "string",
      description: `How to read the input into bytes: ${CODE_PAGES.join(", ")}, utf8, hex, base64 or raw`,
      required: true,
    },
    to: {
      type: "string",
      description: "How to write the bytes: a code page, utf8, hex, base64 or raw (default utf8)",
      default: "utf8",
    },
  },
  run({ args }) {
    const bytes = readBytes(argumentOrStdin(args.input), format("from", args.from));
    const to = format("to", args.to);
    if (to === "raw") process.stdout.write(bytes);
    else process.stdout.write(`${bytesText(bytes, to)}\n`);
  },
});
