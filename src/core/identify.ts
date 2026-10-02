import { equalBytes, toBytes, utf8 } from "./bytes.ts";
import { InvalidOptionError } from "./errors.ts";
import { create, encodings } from "./registry.ts";
import type { Decoded, EncodingInfo } from "./types.ts";

/** One encoding a text decodes in, with how much the result supports it. */
export interface EncodingCandidate {
  /** Registry name. */
  encoding: string;
  /** Score from 0 to 1. It ranks candidates; it is not a probability. */
  confidence: number;
  /** What raised the score, in the order it was added. */
  reasons: string[];
  /** Decoded bytes. */
  bytes: Uint8Array;
  /** The bytes as text, when they are valid UTF-8. */
  text?: string;
  /** Parts of the text that are not data, such as a bech32 prefix. */
  details: Record<string, string | number>;
}

/** Options for `identify`. */
export interface IdentifyOptions {
  /** Most candidates to return. Default: 5. */
  limit?: number;
  /** Encodings to try; default all registered. */
  encodings?: readonly string[];
}

/** Base58 decoding is quadratic in the text length; real base58 strings are short. */
const BASE58_MAX_LENGTH = 1024;

/** Weight of each kind of evidence; the sum is capped at 1. */
const WEIGHTS = { checksum: 0.55, framing: 0.2, text: 0.35, alphabet: 0.15 } as const;

/**
 * Share of characters that read as text: printable ASCII, tab, line breaks and any non-ASCII
 * letter, mark, number, punctuation or symbol.
 *
 * @param text - Decoded text.
 * @returns {number} From 0 to 1.
 */
function printable(text: string): number {
  let count = 0;
  let total = 0;
  for (const character of text) {
    total++;
    if (/[\t\n\r\x20-\x7E]|[\p{L}\p{M}\p{N}\p{P}\p{S}\p{Zs}]/u.test(character)) count++;
  }
  return total === 0 ? 0 : count / total;
}

/** Framing only one encoding writes: a test on the trimmed text and what to call it. */
const FRAMING: Readonly<Record<string, readonly [RegExp, string]>> = {
  hex: [/^0x/iu, "0x prefix"],
  base64: [/=$/u, "padding fits the block length"],
  base32: [/=$/u, "padding fits the block length"],
  base32hex: [/=$/u, "padding fits the block length"],
  ascii85: [/^<~[\s\S]*~>$/u, "<~ ~> delimiters"],
  uuencode: [/^begin [0-7]{3,4} /mu, "begin line"],
  "quoted-printable": [/=[0-9A-F]{2}/u, "=XX escapes"],
};

/**
 * Framing in the text that only this encoding writes.
 *
 * @param encoding - Registry name.
 * @param text - The text as given.
 * @returns {string | undefined} What was found, or nothing.
 */
function framing(encoding: string, text: string): string | undefined {
  const rule = FRAMING[encoding];
  return rule && rule[0].test(text.trim()) ? rule[1] : undefined;
}

/**
 * Scores one decoding of the text.
 *
 * @param info - The encoding's metadata.
 * @param text - The text as given.
 * @param decoded - What the encoding decoded it to.
 * @returns {EncodingCandidate | undefined} The candidate, or nothing when this decoding says nothing.
 */
function candidate(
  info: EncodingInfo,
  text: string,
  decoded: Decoded,
): EncodingCandidate | undefined {
  const frame = framing(info.name, text);
  // Any ASCII text is Quoted-Printable; without an escape it only lost a trailing `=`.
  if (info.name === "quoted-printable" && !frame) return undefined;
  const reasons: string[] = [];
  let score = 0;
  if (info.checksum) {
    score += WEIGHTS.checksum;
    reasons.push("checksum matches");
  }
  if (frame) {
    score += WEIGHTS.framing;
    reasons.push(frame);
  }
  const asText = utf8(decoded.bytes);
  const share = asText === undefined ? 0 : printable(asText);
  score += WEIGHTS.text * share;
  if (share >= 0.95) reasons.push("decodes to readable text");
  const size = Math.max(2, info.alphabet.length);
  score += WEIGHTS.alphabet * Math.max(0, 1 - Math.log2(size) / 7);
  if (size <= 16) reasons.push(`fits a ${size}-character alphabet`);
  return {
    encoding: info.name,
    confidence: Math.min(1, Math.round(score * 1000) / 1000),
    reasons,
    bytes: decoded.bytes,
    ...(asText === undefined ? {} : { text: asText }),
    details: decoded.details,
  };
}

/**
 * Decodes the text in one encoding, or says it cannot be read that way.
 *
 * @param name - Registry name.
 * @param text - The text as given.
 * @param own - The text's own UTF-8 bytes.
 * @returns {EncodingCandidate | undefined} The scored candidate, or nothing.
 */
function attempt(name: string, text: string, own: Uint8Array): EncodingCandidate | undefined {
  const encoding = create(name);
  const info = encoding.info();
  if (info.family === "base58" && text.length > BASE58_MAX_LENGTH) return undefined;
  let decoded: Decoded;
  try {
    decoded = encoding.decode(text);
  } catch {
    return undefined;
  }
  if (decoded.bytes.length === 0 || equalBytes(decoded.bytes, own)) return undefined;
  return candidate(info, text, decoded);
}

/**
 * Ranks the encodings a text decodes in. Each candidate's score adds what supports it: a
 * checksum that matches, framing only that encoding writes, decoded bytes that read as text,
 * and a small alphabet, since text that fits a small alphabet is likelier written in it. An
 * encoding that fails to decode the text, decodes it to nothing, or decodes it to its own
 * bytes is left out.
 *
 * @param text - Text in an unknown encoding.
 * @param options - How many candidates to return and which encodings to try.
 * @returns {EncodingCandidate[]} Candidates, best first.
 */
export function identify(
  text: string,
  options: Readonly<IdentifyOptions> = {},
): EncodingCandidate[] {
  const { limit = 5 } = options;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new InvalidOptionError("limit", limit, "must be a positive integer");
  }
  const own = toBytes(text);
  const names = options.encodings?.map((name) => create(name).name) ?? encodings();
  return names
    .map((name) => attempt(name, text, own))
    .filter((entry) => entry !== undefined)
    .toSorted((left, right) => right.confidence - left.confidence)
    .slice(0, limit);
}
