import { builtins } from "./builtins.ts";
import type { BytesInput } from "./bytes.ts";
import { UnknownEncodingError } from "./errors.ts";
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
  base16: "hex",
  hexadecimal: "hex",
  b32: "base32",
  b58: "base58",
  b64: "base64",
  b85: "base85",
  b91: "base91",
  uu: "uuencode",
  uue: "uuencode",
  qp: "quoted-printable",
  quotedprintable: "quoted-printable",
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
 * Finds the registry name for a name as a person types it: the exact name, then any registered
 * name with the same bare spelling, then a known alias such as `qp` or `b64`.
 *
 * @param name - Name as typed.
 * @returns {string} The registry name.
 */
export function resolveEncoding(name: string): string {
  const trimmed = name.trim();
  if (has(trimmed)) return trimmed;
  const wanted = bare(trimmed);
  const match = encodings().find((entry) => bare(entry) === wanted);
  if (match) return match;
  const alias = ALIASES[wanted];
  if (alias && has(alias)) return alias;
  throw new UnknownEncodingError(name, encodings());
}

/**
 * Creates an encoding by name, as `resolveEncoding` reads it.
 *
 * @param name - Encoding name.
 * @returns {Encoding} The encoding.
 */
export function create(name: string): Encoding {
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
  const wanted = bare(family);
  return infos.filter((info) => bare(info.family) === wanted);
}
