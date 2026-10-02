import { defineCommand } from "citty";
import { utf8 } from "../core/bytes.ts";
import { InvalidOptionError, quote, token } from "../core/errors.ts";
import { hex } from "../core/hex.ts";
import { identify, peel, type EncodingCandidate, type PeelLayer } from "../core/identify.ts";
import { readText } from "./shared.ts";

/** Characters of a decoded value shown per candidate. */
const PREVIEW_LENGTH = 72;

/** Width of the name column: fits `base32 --alphabet=crockford`, the longest built-in reading. */
const NAME_WIDTH = 27;

/**
 * Writes a candidate's decode options as the flags `decode` takes, so the line can be reused.
 *
 * @param options - Decode options of the reading, if any.
 * @returns {string} The flags with leading spaces, or nothing.
 */
function flags(options: Readonly<Record<string, string | number | boolean>> = {}): string {
  return Object.entries(options)
    .map(([name, value]) => {
      if (typeof value === "boolean") return value ? ` --${name}` : ` --no-${name}`;
      return ` --${name}=${token(String(value))}`;
    })
    .join("");
}

/**
 * Writes one candidate or layer as a line: confidence, name with its decode flags, decoded value
 * and reasons.
 *
 * @param candidate - The candidate, or a peeled layer.
 * @returns {string} The line.
 */
function line(candidate: EncodingCandidate | PeelLayer): string {
  const text = utf8(candidate.bytes);
  const readable = text !== undefined && !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(text);
  const value = readable ? quote(text) : hex.encode(candidate.bytes);
  const cut = value.length > PREVIEW_LENGTH ? `${value.slice(0, PREVIEW_LENGTH - 1)}…` : value;
  const reasons = [
    ...("confirmed" in candidate && !candidate.confirmed ? ["unconfirmed guess"] : []),
    ...candidate.reasons,
  ];
  const why = reasons.length > 0 ? `  (${reasons.join(", ")})` : "";
  const name = `${candidate.encoding}${flags(candidate.options)}`;
  return `${candidate.confidence.toFixed(3)}  ${name.padEnd(NAME_WIDTH)} ${cut}${why}\n`;
}

export default defineCommand({
  meta: {
    name: "identify",
    description: "Rank the encodings a string decodes in, or peel them off layer by layer",
  },
  args: {
    text: {
      type: "positional",
      description: "Text in an unknown encoding, or - for stdin",
      required: true,
    },
    limit: {
      type: "string",
      alias: "n",
      description: "Most candidates to show (default 5), or most layers with --peel (default 10)",
    },
    peel: {
      type: "boolean",
      description: "Take encodings off while each decodes to text, outermost first",
    },
  },
  run({ args }) {
    const limit = Number(args.limit ?? (args.peel ? 10 : 5));
    if (!Number.isInteger(limit) || limit < 1) {
      throw new InvalidOptionError("limit", args.limit, "must be a positive integer");
    }
    const text = readText(args.text);
    const found = args.peel ? peel(text, { limit }) : identify(text, { limit });
    if (found.length === 0) {
      process.stderr.write(
        args.peel
          ? "No layer to take off: nothing decodes this text to readable text or past a checksum.\n"
          : "No encoding decodes this text to anything but itself.\n",
      );
      process.exitCode = 1;
      return;
    }
    for (const candidate of found) process.stdout.write(line(candidate));
  },
});
