/**
 * Tool executors behind the definitions in `tools.ts`, loaded on the first call.
 *
 * Each executor returns the text a caller reads plus the structured details the agent harnesses
 * attach to the call. An MCP client sees only the text, so every fact needed for a follow-up
 * call has to be in it. Arguments are checked here as well as in the schemas, since a caller can
 * reach an executor without them.
 */

import { base64 } from "./core/base64.ts";
import { utf8 } from "./core/bytes.ts";
import { InvalidOptionError, quote } from "./core/errors.ts";
import { hex } from "./core/hex.ts";
import { identify, peel, type EncodingCandidate, type PeelLayer } from "./core/identify.ts";
import { create, encodingInfos } from "./core/registry.ts";
import type { EncodingInfo } from "./core/types.ts";
import {
  INPUT_FORMATS,
  MAX_BASE58_LENGTH,
  MAX_CANDIDATES,
  MAX_NAME_LENGTH,
  MAX_TEXT_LENGTH,
  OUTPUT_FORMATS,
  type InputFormat,
  type OutputFormat,
} from "./tool-contract.ts";

/** The contract the playground and the docs read, so a limit changes in one place. */
export { INPUT_FORMATS, MAX_BASE58_LENGTH, MAX_CANDIDATES, MAX_TEXT_LENGTH, OUTPUT_FORMATS };

/**
 * Text for the model plus details for the harness, shared by every tool surface.
 * A failure throws instead: Pi records every returned value as a successful call.
 */
export interface ToolResult<Details> {
  content: Array<{ type: "text"; text: string }>;
  details: Details;
}

export interface EncodeDetails {
  encoding: string;
  /** Encoded text. */
  text: string;
  /** Bytes encoded. */
  byteLength: number;
}

export interface DecodeDetails {
  encoding: string;
  /** Format `value` is written in. */
  format: Exclude<OutputFormat, "auto">;
  /** The decoded bytes in `format`. */
  value: string;
  /** Decoded bytes in hex, whatever the format. */
  hex: string;
  byteLength: number;
  /** Non-data parts of the text: a bech32 prefix, a witness version, a uuencode file name. */
  details: Record<string, string | number>;
}

export interface IdentifyCandidate {
  encoding: string;
  confidence: number;
  reasons: string[];
  hex: string;
  byteLength: number;
  text?: string;
  details: Record<string, string | number>;
  /** On a peeled layer: whether a checksum, framing or readable text backs it. */
  confirmed?: boolean;
}

export interface IdentifyDetails {
  /** Candidates, best first; empty with `peel`. */
  candidates: IdentifyCandidate[];
  /** With `peel`: the layers taken off, outermost first. */
  layers?: IdentifyCandidate[];
}

export interface InfoDetails {
  encodings: EncodingInfo[];
}

/** Characters shown of a decoded value per candidate before it is cut. */
const PREVIEW_LENGTH = 200;

/**
 * Checks a string argument.
 *
 * @param name - Argument name, for the error.
 * @param value - The value as passed.
 * @param max - Longest allowed length.
 * @param min - Shortest allowed length.
 * @returns {string} The value.
 */
function stringArgument(name: string, value: unknown, max: number, min = 1): string {
  if (typeof value !== "string") throw new InvalidOptionError(name, value, "must be a string");
  if (value.length < min || value.length > max) {
    throw new InvalidOptionError(
      name,
      `${value.length} characters`,
      `must be ${min} to ${max} characters`,
    );
  }
  return value;
}

/**
 * Checks an enum argument.
 *
 * @param name - Argument name.
 * @param value - The value as passed.
 * @param allowed - Allowed values.
 * @param fallback - Value when it is absent.
 * @returns {T} The value.
 */
function enumArgument<T extends string>(
  name: string,
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  if (value === undefined) return fallback;
  if (typeof value === "string" && (allowed as readonly string[]).includes(value))
    return value as T;
  throw new InvalidOptionError(name, value, `use one of ${allowed.join(", ")}`);
}

/**
 * Refuses base58 text past the length the tools take, since decoding it is quadratic.
 *
 * @param info - The encoding's metadata.
 * @param length - Length of the text or input.
 */
function checkQuadratic(info: EncodingInfo, length: number): void {
  if (info.family === "base58" && length > MAX_BASE58_LENGTH) {
    throw new InvalidOptionError(
      "text",
      `${length} characters`,
      `base58 takes at most ${MAX_BASE58_LENGTH} here; real base58 strings are short`,
    );
  }
}

/**
 * Whether bytes read as text a person would want shown as text: valid UTF-8 with no control
 * characters other than tab and line breaks.
 *
 * @param bytes - Decoded bytes.
 * @returns {string | undefined} The text, or nothing.
 */
function readable(bytes: Uint8Array): string | undefined {
  const text = utf8(bytes);
  if (text === undefined) return undefined;
  return /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(text.replaceAll(/[\t\n\r]/gu, "")) ? undefined : text;
}

/**
 * Writes the non-data parts of a decoded text on one line.
 *
 * @param details - The parts.
 * @returns {string} Such as `prefix bc, witnessVersion 0`, or empty.
 */
function detailLine(details: Readonly<Record<string, string | number>>): string {
  return Object.entries(details)
    .map(([key, value]) => `${key} ${typeof value === "number" ? value : quote(value)}`)
    .join(", ");
}

/**
 * Splits tool options into the ones an encoding declares and the rest. Strict function calling
 * fills every field of the schema, and `options` holds the fields of every encoding, so base91
 * gets a bech32 prefix. The library would refuse it; the tool takes what applies and names the rest.
 *
 * @param names - Option names the chosen encoding declares.
 * @param options - The options object from the call.
 * @returns {{ taken: Record<string, string | number | boolean>; ignored: string[] }} Options to pass, names left out.
 */
function pickOptions(
  names: readonly string[],
  options: object,
): { taken: Record<string, string | number | boolean>; ignored: string[] } {
  const declared = new Set(names);
  const taken: Record<string, string | number | boolean> = {};
  const ignored: string[] = [];
  for (const [key, value] of Object.entries(options)) {
    if (declared.has(key)) taken[key] = value as string | number | boolean;
    else if (value !== undefined && value !== null) ignored.push(key);
  }
  return { taken, ignored };
}

/**
 * Encodes text or bytes.
 *
 * @param params - Tool arguments.
 * @returns {ToolResult<EncodeDetails>} The encoded text.
 */
export function encodingsEncode(
  params: Readonly<Record<string, unknown>>,
): ToolResult<EncodeDetails> {
  const name = stringArgument("encoding", params["encoding"], MAX_NAME_LENGTH);
  const input = stringArgument("input", params["input"], MAX_TEXT_LENGTH, 0);
  const format: InputFormat = enumArgument(
    "inputFormat",
    params["inputFormat"],
    INPUT_FORMATS,
    "utf8",
  );
  const options = params["options"] ?? {};
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new InvalidOptionError("options", options, "must be an object");
  }
  const encoding = create(name);
  const info = encoding.info();
  const { taken, ignored } = pickOptions(
    info.options.map((option) => option.name),
    options,
  );
  const bytes =
    format === "hex"
      ? hex.decode(input)
      : format === "base64"
        ? base64.decode(input)
        : new TextEncoder().encode(input);
  checkQuadratic(info, bytes.length);
  const text = encoding.encode(bytes, taken);
  if (text.length > MAX_TEXT_LENGTH * 2) {
    throw new InvalidOptionError(
      "input",
      `${bytes.length} bytes`,
      "the result is too long to return",
    );
  }
  return {
    content: [
      {
        type: "text",
        text: `${info.name} (${bytes.length} bytes):\n${text}${ignored.length > 0 ? `\nIgnored, ${info.name} does not take: ${ignored.join(", ")}` : ""}`,
      },
    ],
    details: { encoding: info.name, text, byteLength: bytes.length },
  };
}

/**
 * Decodes text in a named encoding.
 *
 * @param params - Tool arguments.
 * @returns {ToolResult<DecodeDetails>} The bytes as text or hex.
 */
export function encodingsDecode(
  params: Readonly<Record<string, unknown>>,
): ToolResult<DecodeDetails> {
  const name = stringArgument("encoding", params["encoding"], MAX_NAME_LENGTH);
  const text = stringArgument("text", params["text"], MAX_TEXT_LENGTH);
  const wanted: OutputFormat = enumArgument(
    "outputFormat",
    params["outputFormat"],
    OUTPUT_FORMATS,
    "auto",
  );
  const encoding = create(name);
  const info = encoding.info();
  checkQuadratic(info, text.length);
  const { bytes, details } = encoding.decode(text);
  const asText = readable(bytes);
  let format: Exclude<OutputFormat, "auto">;
  if (wanted === "auto") {
    format = asText === undefined ? "hex" : "utf8";
  } else if (wanted === "utf8" && utf8(bytes) === undefined) {
    throw new InvalidOptionError("outputFormat", "utf8", "the bytes are not valid UTF-8; use hex");
  } else {
    format = wanted;
  }
  const value =
    format === "utf8"
      ? utf8(bytes)!
      : format === "base64"
        ? base64.encode(bytes)
        : hex.encode(bytes);
  const extra = detailLine(details);
  const header = `${info.name} → ${bytes.length} bytes as ${format}${extra ? ` (${extra})` : ""}:`;
  return {
    content: [{ type: "text", text: `${header}\n${format === "utf8" ? quote(value) : value}` }],
    details: {
      encoding: info.name,
      format,
      value,
      hex: hex.encode(bytes),
      byteLength: bytes.length,
      details,
    },
  };
}

/**
 * Writes candidates or layers as numbered lines, each with its decoded value.
 *
 * @param entries - Candidates or layers, in order.
 * @returns {string} The lines.
 */
function candidateLines(entries: readonly IdentifyCandidate[]): string {
  const lines = entries.map((candidate, index) => {
    const shown =
      candidate.text === undefined
        ? `hex ${candidate.hex.slice(0, PREVIEW_LENGTH)}${candidate.hex.length > PREVIEW_LENGTH ? "…" : ""}`
        : `text ${quote(candidate.text.slice(0, PREVIEW_LENGTH))}${candidate.text.length > PREVIEW_LENGTH ? "…" : ""}`;
    const guess = candidate.confirmed === false ? " (unconfirmed guess)" : "";
    const why = candidate.reasons.length > 0 ? `; ${candidate.reasons.join(", ")}` : "";
    const extra = detailLine(candidate.details);
    return `${index + 1}. ${candidate.encoding}${guess} ${candidate.confidence}${why}${extra ? `; ${extra}` : ""}\n   ${candidate.byteLength} bytes, ${shown}`;
  });
  return lines.join("\n");
}

/**
 * Shows a candidate or layer the way every tool surface reads it.
 *
 * @param candidate - The candidate, with `confirmed` when it is a peeled layer.
 * @returns {IdentifyCandidate} Hex, byte count and the text when it is readable.
 */
function shownCandidate(candidate: EncodingCandidate | PeelLayer): IdentifyCandidate {
  return {
    encoding: candidate.encoding,
    confidence: candidate.confidence,
    reasons: candidate.reasons,
    hex: hex.encode(candidate.bytes),
    byteLength: candidate.bytes.length,
    ...(readable(candidate.bytes) === undefined ? {} : { text: candidate.text! }),
    details: candidate.details,
    ...("confirmed" in candidate ? { confirmed: candidate.confirmed } : {}),
  };
}

/**
 * Checks the `limit` of `encodings_identify`: candidates, or layers with `peel`.
 *
 * @param value - The value as passed.
 * @param peeling - Whether `peel` is set, which raises the default.
 * @returns {number} The limit.
 */
function identifyLimit(value: unknown, peeling: boolean): number {
  const limit = value ?? (peeling ? 10 : 5);
  if (
    typeof limit !== "number" ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > MAX_CANDIDATES
  ) {
    throw new InvalidOptionError("limit", limit, `must be an integer from 1 to ${MAX_CANDIDATES}`);
  }
  return limit;
}

/**
 * Takes the encodings off a text layer by layer.
 *
 * @param text - The text.
 * @param limit - Most layers.
 * @returns {ToolResult<IdentifyDetails>} Layers, outermost first.
 */
function peeled(text: string, limit: number): ToolResult<IdentifyDetails> {
  const layers = peel(text, { limit }).map((layer) => shownCandidate(layer));
  const body =
    layers.length === 0
      ? "No layer to take off: nothing decodes this text to readable text or past a checksum."
      : `${layers.length} layer${layers.length === 1 ? "" : "s"}, outermost first:\n${candidateLines(layers)}`;
  return { content: [{ type: "text", text: body }], details: { candidates: [], layers } };
}

/**
 * Ranks the encodings a text decodes in, or with `peel` takes them off layer by layer.
 *
 * @param params - Tool arguments.
 * @returns {ToolResult<IdentifyDetails>} Candidates best first, or layers outermost first.
 */
export function encodingsIdentify(
  params: Readonly<Record<string, unknown>>,
): ToolResult<IdentifyDetails> {
  const text = stringArgument("text", params["text"], MAX_TEXT_LENGTH);
  const peeling = params["peel"] ?? false;
  if (typeof peeling !== "boolean") {
    throw new InvalidOptionError("peel", peeling, "must be a boolean");
  }
  const limit = identifyLimit(params["limit"], peeling);
  if (peeling) return peeled(text, limit);
  const candidates = identify(text, { limit }).map((candidate) => shownCandidate(candidate));
  const body =
    candidates.length === 0
      ? "No encoding decodes this text to anything but itself."
      : candidateLines(candidates);
  return { content: [{ type: "text", text: body }], details: { candidates } };
}

/**
 * Lists encodings, or shows one.
 *
 * @param params - Tool arguments.
 * @returns {ToolResult<InfoDetails>} The metadata.
 */
export function encodingsInfo(params: Readonly<Record<string, unknown>>): ToolResult<InfoDetails> {
  if (params["encoding"] !== undefined) {
    const info = create(stringArgument("encoding", params["encoding"], MAX_NAME_LENGTH)).info();
    const options = info.options.map(
      (option) =>
        `  ${option.name} (${option.type}${option.required ? ", required" : ""}${option.default === undefined ? "" : `, default ${JSON.stringify(option.default)}`}): ${option.description}`,
    );
    const lines = [
      `${info.name}: ${info.label}`,
      info.description,
      `Family: ${info.family}. Standard: ${info.standard}.`,
      `Alphabet: ${info.alphabet}`,
      `Checksum: ${info.checksum ? "yes" : "no"}. Padding: ${info.padding ? "yes" : "no"}.`,
      ...(options.length > 0 ? ["Options:", ...options] : ["No options."]),
    ];
    return { content: [{ type: "text", text: lines.join("\n") }], details: { encodings: [info] } };
  }
  const family =
    params["family"] === undefined
      ? undefined
      : stringArgument("family", params["family"], MAX_NAME_LENGTH);
  const infos = encodingInfos(family);
  if (infos.length === 0) {
    const families = [...new Set(encodingInfos().map((info) => info.family))];
    throw new InvalidOptionError("family", family, `use one of ${families.join(", ")}`);
  }
  const lines = infos.map(
    (info) =>
      `${info.name} [${info.family}] ${info.description}${info.options.length > 0 ? ` (options: ${info.options.map((option) => option.name).join(", ")})` : ""}`,
  );
  return { content: [{ type: "text", text: lines.join("\n") }], details: { encodings: infos } };
}
