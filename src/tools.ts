/** The encoding tools, declared once for MCP, Pi, OMP and the AI SDK. Executors load on first call. */

import {
  defineTool,
  Type,
  type TObject,
  type TProperties,
  type ToolDefinition,
} from "@agntn/tools";
import { encodingFamilies } from "./core/types.ts";
import {
  INPUT_FORMATS,
  MAX_CANDIDATES,
  MAX_NAME_LENGTH,
  MAX_PREFIX_LENGTH,
  MAX_TEXT_LENGTH,
  OUTPUT_FORMATS,
} from "./tool-contract.ts";

type ToolOperations = typeof import("./tool-operations.ts");

let operations: Promise<ToolOperations> | undefined;

/**
 * Loads the executors once. A failed load isn't cached, so a broken `dist` doesn't stick.
 *
 * @returns {Promise<ToolOperations>} The executors.
 */
export function loadOperations(): Promise<ToolOperations> {
  operations ??= import("./tool-operations.ts").catch((error: unknown) => {
    operations = undefined;
    throw error;
  });
  return operations;
}

/**
 * An object schema that rejects keys it does not declare, so a misspelled optional argument
 * fails instead of being dropped.
 *
 * @param properties - The declared properties.
 * @returns {TObject} The closed object schema.
 */
function closed<T extends TProperties>(properties: T): TObject<T> {
  return Type.Object(properties, { additionalProperties: false });
}

const encoding = Type.String({
  minLength: 1,
  maxLength: MAX_NAME_LENGTH,
  description:
    "Encoding name, such as base64, base58check or bech32; case, spaces and hyphens do not matter. encodings_info lists them",
});
const text = (description: string) =>
  Type.String({ minLength: 1, maxLength: MAX_TEXT_LENGTH, description });

export const encodeSchema = closed({
  encoding,
  input: Type.String({
    maxLength: MAX_TEXT_LENGTH,
    description: "What to encode: text, or bytes written as inputFormat says",
  }),
  inputFormat: Type.Optional(
    Type.Enum(INPUT_FORMATS, {
      description: "How to read input: utf8 text (default), or bytes in hex or base64",
    }),
  ),
  options: Type.Optional(
    closed({
      prefix: Type.Optional(
        Type.String({
          minLength: 1,
          maxLength: MAX_PREFIX_LENGTH,
          description:
            "bech32 and bech32m: human-readable part, such as bc or npub. Required there",
        }),
      ),
      limit: Type.Optional(
        Type.Integer({
          minimum: 8,
          maximum: MAX_TEXT_LENGTH,
          description: "bech32 and bech32m: longest result allowed (default 90)",
        }),
      ),
      upper: Type.Optional(Type.Boolean({ description: "hex: write A-F" })),
      separate: Type.Optional(
        Type.Boolean({ description: "binary: space between bytes (default true)" }),
      ),
      delimiters: Type.Optional(Type.Boolean({ description: "ascii85: wrap in <~ and ~>" })),
      padding: Type.Optional(
        Type.Boolean({ description: "base32 and base32hex: pad with = (default true)" }),
      ),
      name: Type.Optional(
        Type.String({
          minLength: 1,
          maxLength: 255,
          description: "uuencode: file name on the begin line (default data)",
        }),
      ),
      mode: Type.Optional(
        Type.String({
          pattern: "^[0-7]{3,4}$",
          description: "uuencode: octal mode on the begin line (default 644)",
        }),
      ),
    }),
  ),
});

export const decodeSchema = closed({
  encoding,
  text: text("Text in that encoding"),
  outputFormat: Type.Optional(
    Type.Enum(OUTPUT_FORMATS, {
      description:
        "How to show the bytes: auto (UTF-8 when they are readable text, else hex; default), utf8, hex or base64",
    }),
  ),
});

export const identifySchema = closed({
  text: text("Text in an unknown encoding"),
  limit: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: MAX_CANDIDATES,
      description: `Most candidates to return (default 5, at most ${MAX_CANDIDATES})`,
    }),
  ),
});

export const infoSchema = closed({
  encoding: Type.Optional(
    Type.String({
      minLength: 1,
      maxLength: MAX_NAME_LENGTH,
      description: "Show one encoding with its alphabet and options",
    }),
  ),
  family: Type.Optional(
    Type.String({
      minLength: 1,
      maxLength: MAX_NAME_LENGTH,
      description: `Keep one family: ${encodingFamilies.join(", ")}`,
    }),
  ),
});

export const encodeTool = defineTool({
  name: "encodings_encode",
  title: "Encode",
  description:
    "Write text or bytes in a binary-to-text encoding: hex, binary, base32 and its variants, base45, base58, base58check, base64, base64url, ascii85, z85, base91, bech32, bech32m, uuencode or quoted-printable.",
  snippet: "Use encodings_encode to write text or bytes in base64, base58, bech32 and the like.",
  guidelines: [
    "Text is encoded as UTF-8. For bytes, pass them in hex or base64 and set inputFormat.",
    "bech32 and bech32m need options.prefix. base58check appends the checksum; put the version byte in the input yourself.",
    "Only the options of the chosen encoding apply. Any other option is ignored and named in the reply.",
  ],
  effect: "read",
  input: encodeSchema,
  execute: async (params) => (await loadOperations()).encodingsEncode(params),
});

export const decodeTool = defineTool({
  name: "encodings_decode",
  title: "Decode",
  description:
    "Read text in a named binary-to-text encoding back into bytes, shown as UTF-8 text or hex. Checksums (base58check, bech32, bech32m) are verified, and a segwit address yields its witness version and program.",
  snippet: "Use encodings_decode when you know the encoding of a string.",
  guidelines: [
    "Unsure which encoding it is? Call encodings_identify first.",
    "The answer names the byte count and any prefix, version or file name the text carried.",
  ],
  effect: "read",
  input: decodeSchema,
  execute: async (params) => (await loadOperations()).encodingsDecode(params),
});

export const identifyTool = defineTool({
  name: "encodings_identify",
  title: "Identify Encoding",
  description:
    "Rank the encodings a string decodes in, with the decoded bytes and why each scored as it did: a checksum that matches, framing such as padding or <~ ~>, decoded bytes that read as text, and a small alphabet.",
  snippet: "Use encodings_identify on a string whose encoding nobody named.",
  guidelines: [
    "The confidence ranks candidates; it is not a probability. A matching checksum is the strongest evidence.",
    "Decoded text may itself be encoded again: identify it in turn.",
  ],
  effect: "read",
  input: identifySchema,
  execute: async (params) => (await loadOperations()).encodingsIdentify(params),
});

export const infoTool = defineTool({
  name: "encodings_info",
  title: "Encodings",
  description:
    "List the encodings with their family, standard and options, or show one with its alphabet.",
  snippet: "Use encodings_info to see which encodings exist and what options they take.",
  guidelines: [`Filter by family: ${encodingFamilies.join(", ")}.`],
  effect: "read",
  input: infoSchema,
  execute: async (params) => (await loadOperations()).encodingsInfo(params),
});

/** The encoding tools, in the order every surface lists them. */
export const encodingTools: readonly ToolDefinition[] = [
  encodeTool,
  decodeTool,
  identifyTool,
  infoTool,
];
