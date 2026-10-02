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

/** Options for `peel`. */
export interface PeelOptions {
  /** Most layers to take off. Default: 10. */
  limit?: number;
  /** Encodings to try at each layer; default all registered. */
  encodings?: readonly string[];
}

/** One layer `peel` took off. */
export interface PeelLayer extends EncodingCandidate {
  /**
   * Whether something backs the layer: a checksum, framing, or at least eight bytes of readable
   * text. Only the last layer can be unconfirmed, and then it is a best guess.
   */
  confirmed: boolean;
}

/** A candidate with what `peel` needs to know about it. */
interface Scored {
  candidate: EncodingCandidate;
  /** Backed by a checksum, framing or enough readable text. */
  confirmed: boolean;
  /** The bytes read as text, so the next layer can start from it. */
  readable: boolean;
}

/** Fewest readable bytes that back a layer alone; plain words decode to less by chance. */
const MIN_TEXT_BYTES = 8;

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
 * Scores what the text carries besides its decoded bytes: a checksum and framing.
 *
 * @param info - The encoding's metadata.
 * @param frame - Framing found in the text, if any.
 * @returns {{ score: number; reasons: string[] }} The score and what raised it.
 */
function marks(
  info: EncodingInfo,
  frame: string | undefined,
): { score: number; reasons: string[] } {
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
  return { score, reasons };
}

/**
 * Whether a decoding backs a layer of `peel`: a checksum, framing or enough readable text.
 *
 * @param info - The encoding's metadata.
 * @param frame - Framing found in the text, if any.
 * @param readable - Whether the bytes read as text.
 * @param length - How many bytes it decoded to.
 * @returns {boolean} Whether something confirms it.
 */
function backed(
  info: EncodingInfo,
  frame: string | undefined,
  readable: boolean,
  length: number,
): boolean {
  return info.checksum || frame !== undefined || (readable && length >= MIN_TEXT_BYTES);
}

/**
 * Scores one decoding of the text. Quoted-Printable counts only with an `=XX` escape: any ASCII
 * text is valid Quoted-Printable, and without an escape it only lost a trailing `=`.
 *
 * @param info - The encoding's metadata.
 * @param text - The text as given.
 * @param decoded - What the encoding decoded it to.
 * @returns {Scored | undefined} The candidate, or nothing when this decoding says nothing.
 */
function candidate(info: EncodingInfo, text: string, decoded: Decoded): Scored | undefined {
  const frame = framing(info.name, text);
  if (info.name === "quoted-printable" && !frame) return undefined;
  const { reasons, score: marked } = marks(info, frame);
  let score = marked;
  const asText = utf8(decoded.bytes);
  const share = asText === undefined ? 0 : printable(asText);
  score += WEIGHTS.text * share;
  const readable = share >= 0.95;
  if (readable) reasons.push("decodes to readable text");
  const size = Math.max(2, info.alphabet.length);
  score += WEIGHTS.alphabet * Math.max(0, 1 - Math.log2(size) / 7);
  if (size <= 16) reasons.push(`fits a ${size}-character alphabet`);
  const candidate: EncodingCandidate = {
    encoding: info.name,
    confidence: Math.min(1, Math.round(score * 1000) / 1000),
    reasons,
    bytes: decoded.bytes,
    ...(asText === undefined ? {} : { text: asText }),
    details: decoded.details,
  };
  const confirmed = backed(info, frame, readable, decoded.bytes.length);
  return { candidate, confirmed, readable };
}

/**
 * Decodes the text in one encoding, or says it cannot be read that way.
 *
 * @param name - Registry name.
 * @param text - The text as given.
 * @param own - The text's own UTF-8 bytes.
 * @returns {Scored | undefined} The scored candidate, or nothing.
 */
function attempt(name: string, text: string, own: Uint8Array): Scored | undefined {
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
 * Scores every encoding the text decodes in, best first.
 *
 * @param text - Text in an unknown encoding.
 * @param names - Registry names to try.
 * @returns {Scored[]} Candidates, best first.
 */
function rank(text: string, names: readonly string[]): Scored[] {
  const own = toBytes(text);
  return names
    .map((name) => attempt(name, text, own))
    .filter((entry) => entry !== undefined)
    .toSorted((left, right) => right.candidate.confidence - left.candidate.confidence);
}

/**
 * Reads the shared options of `identify` and `peel`.
 *
 * @param limit - The limit given.
 * @param wanted - Encodings given, if any.
 * @returns {string[]} Registry names to try.
 */
function tried(limit: number, wanted: readonly string[] | undefined): string[] {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new InvalidOptionError("limit", limit, "must be a positive integer");
  }
  return wanted?.map((name) => create(name).name) ?? encodings();
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
  const names = tried(limit, options.encodings);
  return rank(text, names)
    .slice(0, limit)
    .map((entry) => entry.candidate);
}

/**
 * Whether unconfirmed text still looks encoded rather than plain: a digit, and no whitespace
 * unless the guess is a small alphabet like hex. Prose decodes in base32 too.
 *
 * @param text - The text the guess decodes.
 * @param encoding - Registry name of the best candidate for it.
 * @returns {boolean} Whether to show the guess.
 */
function looksEncoded(text: string, encoding: string): boolean {
  if (!/\d/u.test(text)) return false;
  return !/\s/u.test(text.trim()) || create(encoding).info().alphabet.length <= 16;
}

/**
 * Picks the next layer of `peel`: the best confirmed candidate, else the best guess when the
 * text still looks encoded.
 *
 * @param text - The text to take a layer off.
 * @param names - Registry names to try.
 * @returns {Scored | undefined} The layer, or nothing when peeling stops here.
 */
function nextLayer(text: string, names: readonly string[]): Scored | undefined {
  const ranked = rank(text, names);
  const next = ranked.find((entry) => entry.confirmed) ?? ranked[0];
  if (next === undefined) return undefined;
  return next.confirmed || looksEncoded(text, next.candidate.encoding) ? next : undefined;
}

/**
 * Takes encodings off one layer at a time, each the best confirmed candidate, while it decodes
 * to text. When nothing is confirmed but the text still looks encoded, the best guess comes last
 * with `confirmed: false`, so base64 over encrypted bytes still shows.
 *
 * @param text - Text in an unknown encoding, perhaps several.
 * @param options - Most layers and which encodings to try.
 * @returns {PeelLayer[]} Layers, outermost first; empty when nothing decodes the text.
 */
export function peel(text: string, options: Readonly<PeelOptions> = {}): PeelLayer[] {
  const { limit = 10 } = options;
  const names = tried(limit, options.encodings);
  const layers: PeelLayer[] = [];
  let current: string | undefined = text;
  while (current !== undefined && layers.length < limit) {
    const next = nextLayer(current, names);
    if (next === undefined) break;
    layers.push({ ...next.candidate, confirmed: next.confirmed });
    current = next.confirmed && next.readable ? next.candidate.text : undefined;
  }
  return layers;
}
