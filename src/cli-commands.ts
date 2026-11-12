/**
 * The commands only the CLI gets: bytes from stdin byte for byte, decoded bytes raw on stdout, and
 * one flag per codec option instead of an `options` object in JSON. Each takes the place of the
 * tool command with its name. Executors load on first call, so `--help` never loads a codec.
 */

import { defineTool, Type, type TObject, type TProperties } from "@agntn/tools";
import { CHARSET_FORMATS, INPUT_FORMATS } from "./tool-contract.ts";
import { identifySchema } from "./tools.ts";

type CliOperations = typeof import("./cli-operations.ts");

let operations: Promise<CliOperations> | undefined;

/**
 * Loads the executors once. A failed load isn't cached, so a broken `dist` doesn't stick.
 *
 * @returns {Promise<CliOperations>} The executors.
 */
function loadOperations(): Promise<CliOperations> {
  operations ??= import("./cli-operations.ts").catch((error: unknown) => {
    operations = undefined;
    throw error;
  });
  return operations;
}

/**
 * An object schema that refuses keys it does not declare.
 *
 * @param properties - The declared properties.
 * @returns {TObject} The closed object schema.
 */
function closed<T extends TProperties>(properties: T): TObject<T> {
  return Type.Object(properties, { additionalProperties: false });
}

const text = (description: string) => Type.Optional(Type.String({ description }));

const flag = (description: string) => Type.Optional(Type.Boolean({ description }));

const encoding = Type.String({
  minLength: 1,
  description: "Encoding, such as base64, base58 or bech32 (encodings list)",
});
const alphabet = text(
  "base32, base58, base64, base85, base256, ita2: alphabet (encodings list <encoding>)",
);
const m = flag("bech32: Bech32m checksum (segwit v1+)");
const symbols = text("binary: the characters for 0 and 1 (default 01). base256: the table");
const bits = Type.Optional(
  Type.Integer({ description: "binary: bits per byte, 1 to 8 (default 8)" }),
);
const order = text("binary, ita2: msb or lsb first (default msb)");
const numbers = flag("ita2: codes as numbers 0 to 31 in place of bits");
const sample = text("base256: text whose symbols, in order of first appearance, make the table");
const multibase = flag("base256: the 🚀 multibase prefix");
const radix = Type.Optional(Type.Integer({ description: "integer: base, 2 to 36 (default 10)" }));
const digits = text("integer: one symbol per digit, lowest first, in place of --radix");
const bijective = flag("integer: no zero digit, the first symbol is 1");
const codebook = text("prefix: codewords by symbol, such as A=0 B=10 C=11");
const code = text("prefix: truncated, unary or gamma in place of --codebook");
const n = Type.Optional(Type.Integer({ description: "prefix --code truncated: how many symbols" }));

/** The flags `encode` turns into encoding options, which each encoding checks against its own. */
export const encodeFlags = {
  prefix: text("bech32: human-readable part, such as bc"),
  limit: Type.Optional(Type.Integer({ description: "bech32: longest result (default 90)" })),
  m,
  upper: flag("hex: write A-F"),
  ascii: flag("html: write characters past ASCII as &#x...; too"),
  separate: flag(
    "binary: space between bytes, ita2: between codes (default true), prefix: between codewords",
  ),
  symbols,
  bits,
  order,
  sample,
  multibase,
  radix,
  digits,
  bijective,
  numbers,
  codebook,
  code,
  n,
  alphabet,
  check: flag("base58: Base58Check, with a double SHA-256 checksum"),
  blocks: flag("base58: Monero's blocks, 8 bytes to 11 characters"),
  delimiters: flag("base85 --alphabet ascii85: wrap in <~ and ~>"),
  padding: flag("base32, base64: pad with = (default true)"),
  name: text("uuencode: file name on the begin line"),
  mode: text("uuencode: octal mode on the begin line"),
};

/** The flags `decode` turns into decode options. */
export const decodeFlags = {
  alphabet,
  check: flag("base58: Base58Check, verify and strip the checksum"),
  blocks: flag("base58: Monero's blocks of 11 characters"),
  m,
  symbols,
  bits,
  order,
  sample,
  multibase,
  radix,
  digits,
  bijective,
  numbers,
  codebook,
  code,
  n,
  width: Type.Optional(Type.Integer({ description: "integer: bytes to fill with leading zeros" })),
  canonical: flag("base32, base64: refuse non-zero spare bits in the last character"),
};

export const encodeSchema = closed({
  encoding,
  input: Type.String({ description: "Text to encode, or - for stdin byte for byte" }),
  inputFormat: Type.Optional(
    Type.Enum(INPUT_FORMATS, {
      description:
        "How to read the input: utf8 (default), or hex and base64 for the bytes they spell",
    }),
  ),
  ...encodeFlags,
});

export const decodeSchema = closed({
  encoding,
  text: Type.String({ description: "Encoded text, or - for stdin" }),
  output: Type.Optional(
    Type.Enum(["raw", "hex", "base64"], {
      description: "How to write the bytes: raw (default), hex or base64",
    }),
  ),
  ...decodeFlags,
});

/** How `convert` reads and writes: the tool's formats, plus `raw` for bytes as they are. */
export const CONVERT_FORMATS = ["raw", ...CHARSET_FORMATS] as const;

export const convertSchema = closed({
  input: Type.String({ description: "Text to convert, or - for stdin" }),
  from: Type.Enum(CONVERT_FORMATS, {
    description: "How to read the input into bytes: a code page, utf8, hex, base64 or raw",
  }),
  to: Type.Optional(
    Type.Enum(CONVERT_FORMATS, {
      description: "How to write the bytes: a code page, utf8 (default), hex, base64 or raw",
    }),
  ),
});

export const identifyCommandSchema = closed({
  text: Type.String({ description: "Text in an unknown encoding, or - for stdin" }),
  limit: Type.Optional(
    Type.Integer({
      minimum: 1,
      description: "Most candidates to show (default 5), or most layers with --peel (default 10)",
    }),
  ),
  peel: identifySchema.properties.peel,
});

export const encodeCommand = defineTool({
  name: "encodings_encode",
  title: "Encode",
  description: "Write text or bytes in an encoding",
  effect: "read",
  input: encodeSchema,
  cli: { positional: ["encoding", "input"], plain: ["encoding"], json: false },
  execute: async (params) => (await loadOperations()).encode(params),
});

export const decodeCommand = defineTool({
  name: "encodings_decode",
  title: "Decode",
  description: "Read text in an encoding back into bytes",
  effect: "read",
  input: decodeSchema,
  cli: {
    positional: ["encoding", "text"],
    plain: ["encoding"],
    short: { output: "o" },
    json: false,
  },
  execute: async (params) => (await loadOperations()).decode(params),
});

export const convertCommand = defineTool({
  name: "encodings_charset_convert",
  title: "Convert Code Page",
  description: "Read text as bytes in one code page and write them in another",
  effect: "read",
  input: convertSchema,
  cli: { command: "convert", positional: ["input"], json: false },
  execute: async (params) => (await loadOperations()).convert(params),
});

export const identifyCommand = defineTool({
  name: "encodings_identify",
  title: "Identify Encoding",
  description: "Rank the encodings a string decodes in, or peel them off layer by layer",
  effect: "read",
  input: identifyCommandSchema,
  cli: { positional: ["text"], short: { limit: "n" } },
  execute: async (params) => (await loadOperations()).identify(params),
});

/** The commands that take the place of the generated ones with their names. */
export const cliCommands = [encodeCommand, decodeCommand, identifyCommand, convertCommand];
