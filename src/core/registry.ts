import { builtins } from "./builtins.ts";
import { isBytes, typeName, type BytesInput } from "./bytes.ts";
import { EncodingError, UnknownEncodingError, quote } from "./errors.ts";
import type { DecodeOptions, Decoded, EncodeOptions, Encoding, EncodingInfo } from "./types.ts";

let entries: Map<string, Encoding> | undefined;

/**
 * The encoding map, seeded with the built-ins on first use. Importing the package mutates no
 * shared state, which is what `sideEffects: false` promises.
 *
 * @returns {Map<string, Encoding>} Registered encodings by name.
 */
function registry(): Map<string, Encoding> {
  entries ??= new Map(builtins.map((encoding) => [encoding.name, encoding] as const));
  return entries;
}

/**
 * Registers an encoding under its `name`, replacing any encoding with the same name.
 *
 * @param encoding - The encoding.
 */
export function register(encoding: Encoding): void {
  registry().set(encoding.name, encoding);
}

/**
 * Lists the registered encoding names: the built-ins in listing order, then registrations.
 *
 * @returns {string[]} Registered names.
 */
export function encodings(): string[] {
  return [...registry().keys()];
}

/**
 * Checks whether an encoding is registered.
 *
 * @param name - Exact registry name.
 * @returns {boolean} Whether the name is registered.
 */
export function has(name: string): boolean {
  return registry().has(name);
}

/** Names people type for a built-in, by their spelling without separators. */
const ALIASES: Readonly<Record<string, string>> = {
  base2: "binary",
  bin: "binary",
  bigint: "integer",
  base16: "hex",
  hexadecimal: "hex",
  b32: "base32",
  b58: "base58",
  b64: "base64",
  b85: "base85",
  b91: "base91",
  base256emoji: "base256",
  uu: "uuencode",
  uue: "uuencode",
  qp: "quoted-printable",
  quotedprintable: "quoted-printable",
  entities: "html",
  htmlentities: "html",
  baudot: "ita2",
  prefixcode: "prefix",
  huffman: "prefix",
  squares: "square",
  chesssquare: "square",
  forsythedwards: "fen",
  forsyth: "fen",
};

/**
 * Spells a name without case, spaces, hyphens or underscores, so `Base 64`, `base-64` and
 * `BASE_64` compare equal.
 *
 * @param name - Name as typed.
 * @returns {string} The bare spelling.
 */
function bare(name: string): string {
  return name.toLowerCase().replaceAll(/[\s_-]+/gu, "");
}

/**
 * `resolveEncoding` that answers a miss with `undefined` instead of throwing.
 *
 * @param name - Name as typed.
 * @returns {string | undefined} The registry name, if any.
 */
function lookup(name: string): string | undefined {
  const trimmed = name.trim();
  if (has(trimmed)) return trimmed;
  const wanted = bare(trimmed);
  const match = encodings().find((entry) => bare(entry) === wanted);
  if (match) return match;
  const alias = ALIASES[wanted];
  return alias && has(alias) ? alias : undefined;
}

/**
 * How every refusal of a name that isn't a string starts.
 *
 * @param where - The function called, such as `create`.
 * @param name - What came in as the name.
 * @returns {string} The opening of the message.
 */
function notAName(where: string, name: unknown): string {
  return `${where} takes the encoding name as a string, got ${typeName(name)}`;
}

/**
 * Refuses a name before `trim` dies on it with a bare TypeError.
 *
 * @param where - The function called, such as `create`.
 * @param name - What came in as the name.
 * @throws {EncodingError} When `name` isn't a string.
 */
function requireName(where: string, name: unknown): asserts name is string {
  if (typeof name !== "string") throw new EncodingError(notAName(where, name));
}

/** What `encode` and `decode` take after the name. */
const SECOND = { encode: "input", decode: "text" } as const;

/**
 * Refuses a name that isn't a string and writes the call out the right way round.
 *
 * @param call - `encode` or `decode`.
 * @param args - The first two arguments, as passed.
 * @throws {EncodingError} When the name isn't a string.
 */
function requireOrder(call: keyof typeof SECOND, args: readonly [unknown, unknown]): void {
  const [name, second] = args;
  if (typeof name === "string") return;
  const swapped = isBytes(name) && typeof second === "string" ? lookup(second) : undefined;
  const hint =
    swapped === undefined
      ? `call it as ${call}(name, ${SECOND[call]})`
      : `the arguments look swapped, call it as ${call}(${quote(swapped)}, ${SECOND[call]})`;
  throw new EncodingError(`${notAName(call, name)}; ${hint}`);
}

/**
 * Finds the registry name for a name as a person types it: the exact name, then any registered
 * name with the same bare spelling, then a known alias such as `qp` or `b64`.
 *
 * @param name - Name as typed.
 * @returns {string} The registry name.
 * @throws {EncodingError} When `name` is not a string.
 * @throws {UnknownEncodingError} When nothing matches.
 */
export function resolveEncoding(name: string): string {
  requireName("resolveEncoding", name);
  const found = lookup(name);
  if (found === undefined) throw new UnknownEncodingError(name, encodings());
  return found;
}

/**
 * Creates an encoding by name, as `resolveEncoding` reads it.
 *
 * @param name - Encoding name.
 * @returns {Encoding} The encoding.
 */
export function create(name: string): Encoding {
  requireName("create", name);
  return registry().get(resolveEncoding(name))!;
}

/**
 * Writes text or bytes in an encoding.
 *
 * @param name - Encoding name, such as `base58`.
 * @param input - Text, read as UTF-8, or bytes.
 * @param options - Options the encoding takes, such as bech32's `prefix`.
 * @returns {string} The encoded text.
 */
export function encode(name: string, input: BytesInput, options?: EncodeOptions): string {
  requireOrder("encode", [name, input]);
  return create(name).encode(input, options);
}

/**
 * Reads text in an encoding.
 *
 * @param name - Encoding name.
 * @param text - Encoded text.
 * @param options - Options the encoding reads with, such as base32's `alphabet`.
 * @returns {Decoded} The bytes and any non-data parts of the text.
 */
export function decode(name: string, text: string, options?: DecodeOptions): Decoded {
  requireOrder("decode", [name, text]);
  return create(name).decode(text, options);
}

/**
 * Reads the metadata of every registered encoding, or of one family.
 *
 * @param family - Family to keep, such as `base58`; omit for all.
 * @returns {EncodingInfo[]} The metadata in listing order.
 */
export function encodingInfos(family?: string): EncodingInfo[] {
  const infos = encodings().map((name) => registry().get(name)!.info());
  if (family === undefined) return infos;
  if (typeof family !== "string") {
    throw new EncodingError(`encodingInfos takes the family as a string, got ${typeName(family)}`);
  }
  const wanted = bare(family);
  return infos.filter((info) => bare(info.family) === wanted);
}
