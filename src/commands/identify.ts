import { defineCommand } from "citty";
import { utf8 } from "../core/bytes.ts";
import { InvalidOptionError, quote } from "../core/errors.ts";
import { hex } from "../core/hex.ts";
import { identify } from "../core/identify.ts";
import { readText } from "./shared.ts";

/** Characters of a decoded value shown per candidate. */
const PREVIEW_LENGTH = 72;

export default defineCommand({
  meta: {
    name: "identify",
    description: "Rank the encodings a string decodes in",
  },
  args: {
    text: {
      type: "positional",
      description: "Text in an unknown encoding, or - for stdin",
      required: true,
    },
    limit: { type: "string", alias: "n", description: "Most candidates to show", default: "5" },
  },
  run({ args }) {
    const limit = Number(args.limit);
    if (!Number.isInteger(limit) || limit < 1) {
      throw new InvalidOptionError("limit", args.limit, "must be a positive integer");
    }
    const candidates = identify(readText(args.text), { limit });
    if (candidates.length === 0) {
      process.stderr.write("No encoding decodes this text to anything but itself.\n");
      process.exitCode = 1;
      return;
    }
    for (const candidate of candidates) {
      const text = utf8(candidate.bytes);
      const readable = text !== undefined && !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(text);
      const value = readable ? quote(text) : hex.encode(candidate.bytes);
      const cut = value.length > PREVIEW_LENGTH ? `${value.slice(0, PREVIEW_LENGTH - 1)}…` : value;
      const why = candidate.reasons.length > 0 ? `  (${candidate.reasons.join(", ")})` : "";
      process.stdout.write(
        `${candidate.confidence.toFixed(3)}  ${candidate.encoding.padEnd(16)} ${cut}${why}\n`,
      );
    }
  },
});
