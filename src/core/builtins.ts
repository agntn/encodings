import { BASE32_ALPHABETS, base32, type Base32Alphabet } from "./base32.ts";
import { base45 } from "./base45.ts";
import {
  BASE58_ALPHABET,
  BASE58_ALPHABETS,
  base58,
  type Base58Alphabet,
  type Base58Options,
} from "./base58.ts";
import { BASE64_ALPHABETS, base64, type Base64Alphabet } from "./base64.ts";
import { BASE85_ALPHABETS, base85, type Base85Alphabet } from "./base85.ts";
import { base91 } from "./base91.ts";
import {
  BASE256_ALPHABETS,
  base256,
  type Base256Alphabet,
  type Base256Options,
} from "./base256.ts";
import { BECH32_LIMIT, bech32, bech32m, segwit, type SegwitAddress } from "./bech32.ts";
import { binary, type BinaryOptions, type BitOrder } from "./binary.ts";
import { isBytes, requireText, toBytes, typeName, type BytesInput } from "./bytes.ts";
import { CHESS_LAYOUTS, square, type ChessLayout, type SquareOptions } from "./chess.ts";
import { decimal } from "./decimal.ts";
import { FEN_TURNS, fen, type FenEncodeOptions, type FenOptions } from "./fen.ts";
import { EncodingError, InvalidOptionError, MissingOptionError } from "./errors.ts";
import { hex } from "./hex.ts";
import { html } from "./html.ts";
import { integer, type IntegerOptions } from "./integer.ts";
import { ITA2_ALPHABETS, ita2, type Ita2Alphabet, type Ita2Options } from "./ita2.ts";
import { octal } from "./octal.ts";
import { PREFIX_CODES, prefix, type PrefixCodeName, type PrefixOptions } from "./prefix.ts";
import { quotedPrintable } from "./quoted-printable.ts";
import type {
  DecodeOptions,
  Decoded,
  EncodeOptions,
  Encoding,
  EncodingInfo,
  EncodingOption,
} from "./types.ts";
import { uuencode } from "./uuencode.ts";

/** Metadata of a built-in, without the fields every one fills the same way. */
type About = Omit<EncodingInfo, "name" | "checksum" | "padding" | "options"> &
  Partial<Pick<EncodingInfo, "checksum" | "padding" | "options">>;

/** Checked option values, by option name. */
type Values = Readonly<Record<string, string | number | boolean>>;

/**
 * Checks one value the caller passed against the option it names: its type and, for a choice,
 * one of its values.
 *
 * @param options - Descriptors.
 * @param name - Option name.
 * @param value - The value.
 */
function checkGiven(options: readonly EncodingOption[], name: string, value: unknown): void {
  const option = options.find((entry) => entry.name === name);
  if (!option) {
    const known = options.map((entry) => entry.name);
    const reason =
      known.length > 0
        ? `not an option here; use ${known.join(", ")}`
        : "this encoding takes no options";
    throw new InvalidOptionError(name, value, reason);
  }
  if (typeof value !== option.type) {
    throw new InvalidOptionError(name, value, `must be a ${option.type}`);
  }
  if (option.choices && !option.choices.includes(String(value))) {
    throw new InvalidOptionError(name, value, `use one of ${option.choices.join(", ")}`);
  }
}

/**
 * Checks option values against their descriptors: no unknown name, each value of its type and
 * each required one present.
 *
 * @param options - Descriptors.
 * @param given - Values from the caller.
 * @returns {Values} The values with defaults filled in.
 */
function checked(options: readonly EncodingOption[], given: EncodeOptions = {}): Values {
  const present = Object.entries(given).filter(
    (entry): entry is [string, string | number | boolean] => entry[1] !== undefined,
  );
  for (const [name, value] of present) checkGiven(options, name, value);
  const out: Record<string, string | number | boolean> = Object.fromEntries(present);
  for (const option of options) {
    if (option.name in out) continue;
    if (option.required) throw new MissingOptionError(option.name, option.description);
    if (option.default !== undefined) out[option.name] = option.default;
  }
  return out;
}

/**
 * Builds a built-in encoding from its metadata and two functions over checked values.
 *
 * @param name - Registry name.
 * @param about - Metadata.
 * @param write - Encodes bytes with checked option values.
 * @param read - Decodes text with the checked values of the options marked `decode`.
 * @returns {Encoding} The encoding.
 */
function define(
  name: string,
  about: About,
  write: (bytes: Uint8Array, values: Values) => string,
  read: (text: string, values: Values) => Decoded | Uint8Array,
): Encoding {
  const info: EncodingInfo = {
    name,
    checksum: false,
    padding: false,
    options: [],
    ...about,
  };
  const writing = info.options.filter((option) => option.narrows !== true);
  return {
    name,
    info: () => structuredClone(info),
    encode(input: BytesInput, options?: EncodeOptions) {
      if (typeof input !== "string" && !isBytes(input)) {
        throw new EncodingError(`${name}: encode takes text or bytes, got ${typeName(input)}`);
      }
      return write(toBytes(input), checked(writing, options));
    },
    decode(text: string, options?: DecodeOptions) {
      requireText(`${name}: decode`, text);
      const reading = info.options.filter((option) => option.decode === true);
      const result = read(text, checked(reading, options));
      return result instanceof Uint8Array ? { bytes: result, details: {} } : result;
    },
  };
}

/**
 * Reads binary options from checked values.
 *
 * @param values - Checked option values.
 * @returns {BinaryOptions} The codec options.
 */
function binaryOptions(values: Values): BinaryOptions {
  return {
    symbols: String(values["symbols"]),
    bits: Number(values["bits"]),
    order: String(values["order"]) as BitOrder,
  };
}

/**
 * Reads integer options from checked values; `radix` has no default, since `digits` sets it.
 *
 * @param values - Checked option values.
 * @returns {IntegerOptions} The codec options.
 */
function integerOptions(values: Values): IntegerOptions {
  const { radix, digits } = values;
  return {
    ...(radix === undefined ? {} : { radix: Number(radix) }),
    ...(digits === undefined ? {} : { digits: String(digits) }),
    bijective: values["bijective"] === true,
  };
}

/**
 * Reads ita2 options from checked values.
 *
 * @param values - Checked option values.
 * @returns {Ita2Options} The codec options.
 */
function ita2Options(values: Values): Ita2Options {
  return {
    alphabet: String(values["alphabet"]) as Ita2Alphabet,
    order: String(values["order"]) as BitOrder,
    numbers: values["numbers"] === true,
  };
}

/**
 * Reads prefix code options from checked values.
 *
 * @param values - Checked option values.
 * @returns {PrefixOptions} The codec options.
 */
function prefixOptions(values: Values): PrefixOptions {
  const { codebook, code, n } = values;
  return {
    ...(codebook === undefined ? {} : { codebook: String(codebook) }),
    ...(code === undefined ? {} : { code: String(code) as PrefixCodeName }),
    ...(n === undefined ? {} : { n: Number(n) }),
  };
}

/**
 * Reads bits with a prefix code, the Kraft sum and any leftover bits as details.
 *
 * @param text - The bits.
 * @param values - Checked option values.
 * @returns {Decoded} The text and the details.
 */
function readPrefix(text: string, values: Values): Decoded {
  const { bytes, kraft, leftover } = prefix.decode(text, prefixOptions(values));
  const details: Record<string, string | number> = { kraft };
  if (leftover !== "") Object.assign(details, { leftover, leftoverBits: leftover.length });
  return { bytes, details };
}

/**
 * Reads square options from checked values.
 *
 * @param values - Checked option values.
 * @returns {SquareOptions} The codec options.
 */
function squareOptions(values: Values): SquareOptions {
  return {
    layout: String(values["layout"]) as ChessLayout,
    pairs: values["pairs"] === true,
    bitboard: values["bitboard"] === true,
  };
}

/**
 * Reads the board options of fen from checked values.
 *
 * @param values - Checked option values.
 * @returns {FenOptions} The layout and the diagram switch.
 */
function fenOptions(values: Values): FenOptions {
  return { layout: String(values["layout"]) as ChessLayout, diagram: values["diagram"] === true };
}

/**
 * Reads the encode options of fen from checked values, the fields after the board as given.
 *
 * @param values - Checked option values.
 * @returns {FenEncodeOptions} The codec options.
 */
function fenEncodeOptions(values: Values): FenEncodeOptions {
  const { turn, castling, enPassant, halfmove, fullmove } = values;
  return {
    ...fenOptions(values),
    ...(turn === undefined ? {} : { turn: String(turn) as FenEncodeOptions["turn"] }),
    ...(castling === undefined ? {} : { castling: String(castling) }),
    ...(enPassant === undefined ? {} : { enPassant: String(enPassant) }),
    ...(halfmove === undefined ? {} : { halfmove: Number(halfmove) }),
    ...(fullmove === undefined ? {} : { fullmove: Number(fullmove) }),
  };
}

/**
 * Reads a FEN or a diagram, the fields after the board as details.
 *
 * @param text - The FEN or the diagram.
 * @param values - Checked option values.
 * @returns {Decoded} The board and the fields.
 */
function readFen(text: string, values: Values): Decoded {
  const { bytes, fields } = fen.decode(text, fenOptions(values));
  return { bytes, details: { ...fields } };
}

/**
 * Reads base256 options from checked values.
 *
 * @param values - Checked option values.
 * @returns {Base256Options} The codec options.
 */
function base256Options(values: Values): Base256Options {
  const { symbols, sample } = values;
  return {
    alphabet: String(values["alphabet"]) as Base256Alphabet,
    ...(symbols === undefined ? {} : { symbols: String(symbols) }),
    ...(sample === undefined ? {} : { sample: String(sample) }),
    multibase: values["multibase"] === true,
  };
}

/**
 * Reads base58 options from checked values.
 *
 * @param values - Checked option values.
 * @returns {Base58Options} The codec options.
 */
function base58Options(values: Values): Base58Options {
  return {
    alphabet: String(values["alphabet"]) as Base58Alphabet,
    check: values["check"] === true,
    blocks: values["blocks"] === true,
  };
}

/**
 * Reads bech32 text. A valid segwit address of the chosen variant comes back as its program with
 * its version; anything else as the bytes the words carry.
 *
 * @param text - Bech32 text.
 * @param m - Whether to read the Bech32m checksum.
 * @returns {Decoded} The bytes with the prefix, and the witness version of an address.
 */
function readBech32(text: string, m: boolean): Decoded {
  const address = segwitAddress(text, !m);
  if (address) {
    return {
      bytes: address.program,
      details: { prefix: address.prefix, witnessVersion: address.version },
    };
  }
  const { prefix, bytes } = (m ? bech32m : bech32).decode(
    text,
    Math.max(text.length, BECH32_LIMIT),
  );
  return { bytes, details: { prefix } };
}

/**
 * Reads text as a segwit address of one variant, if it is one.
 *
 * @param text - Bech32 text.
 * @param versionZero - Whether the variant is bech32, which only version 0 uses.
 * @returns {SegwitAddress | undefined} The address, or nothing.
 */
function segwitAddress(text: string, versionZero: boolean): SegwitAddress | undefined {
  if (text.length > BECH32_LIMIT) return undefined;
  let address: SegwitAddress;
  try {
    address = segwit.decode(text);
  } catch {
    return undefined;
  }
  // segwit.decode takes either variant; version 0 is bech32's, the rest bech32m's.
  return (address.version === 0) === versionZero ? address : undefined;
}

/** Tab and the printable ASCII range, space to tilde: what Quoted-Printable lines are made of. */
const PRINTABLE_ASCII = `\t${Array.from({ length: 95 }, (_, index) => String.fromCodePoint(32 + index)).join("")}`;
const BASE32_RFC = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const BASE64_RFC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** The base32 and base64 switch for the spare bits of the last character. */
const CANONICAL: EncodingOption = {
  name: "canonical",
  type: "boolean",
  required: false,
  default: false,
  description:
    "Refuse non-zero spare bits in the last character; case, whitespace and padding read as usual",
  decode: true,
  narrows: true,
};

/** The built-in encodings, in listing order: by radix, then by how common each variant is. */
export const builtins: readonly Encoding[] = [
  define(
    "binary",
    {
      label: "Binary",
      description: "Eight 0 and 1 digits per byte, most significant bit first",
      family: "binary",
      standard: "Base2, most significant bit first",
      alphabet: "01",
      options: [
        {
          name: "separate",
          type: "boolean",
          required: false,
          default: true,
          description: "Put a space between bytes",
        },
        {
          name: "symbols",
          type: "string",
          required: false,
          default: "01",
          description: "The character for 0, then the one for 1, such as ab",
          decode: true,
        },
        {
          name: "bits",
          type: "number",
          required: false,
          default: 8,
          description: "Bits per byte, from 1 to 8; 7 for 7-bit ASCII",
          decode: true,
        },
        {
          name: "order",
          type: "string",
          required: false,
          default: "msb",
          description: "Most or least significant bit first",
          decode: true,
          choices: ["msb", "lsb"],
        },
      ],
    },
    (bytes, values) =>
      binary.encode(bytes, { ...binaryOptions(values), separate: values["separate"] === true }),
    (text, values) => binary.decode(text, binaryOptions(values)),
  ),
  define(
    "octal",
    {
      label: "Octal",
      description: "One octal number from 0 to 377 per byte, spaced; decoding also takes commas",
      family: "octal",
      standard: "Byte values in base 8",
      alphabet: "01234567",
      options: [
        {
          name: "separate",
          type: "boolean",
          required: false,
          default: true,
          description: "Put a space between bytes; without it each byte takes three digits",
        },
      ],
    },
    (bytes, values) => octal.encode(bytes, { separate: values["separate"] === true }),
    (text) => octal.decode(text),
  ),
  define(
    "decimal",
    {
      label: "Decimal",
      description:
        "One decimal number from 0 to 255 per byte, spaced, or one per code point; decoding also takes commas",
      family: "decimal",
      standard: "Byte values in base 10; Unicode code points",
      alphabet: "0123456789",
      options: [
        {
          name: "codepoints",
          type: "boolean",
          required: false,
          default: false,
          description: "Each number is a Unicode code point of UTF-8 text, such as 380 for ż",
          decode: true,
        },
        {
          name: "separate",
          type: "boolean",
          required: false,
          default: true,
          description:
            "Put a space between bytes; without it each byte takes three digits. Code points are always spaced",
        },
      ],
    },
    (bytes, values) =>
      decimal.encode(bytes, {
        codepoints: values["codepoints"] === true,
        separate: values["separate"] === true,
      }),
    (text, values) => decimal.decode(text, { codepoints: values["codepoints"] === true }),
  ),
  define(
    "integer",
    {
      label: "Integer",
      description: "One whole number in any base, read as big-endian bytes; bijective numerals too",
      family: "integer",
      standard: "Unsigned big-endian integer in a positional numeral",
      alphabet: "0123456789",
      options: [
        {
          name: "radix",
          type: "number",
          required: false,
          description:
            "Base from 2 to 36, digits 0-9 then a-z (default 10); up to 35 with bijective",
          decode: true,
        },
        {
          name: "digits",
          type: "string",
          required: false,
          description: "One symbol per digit, lowest first, in place of radix; case counts",
          decode: true,
        },
        {
          name: "bijective",
          type: "boolean",
          required: false,
          default: false,
          description: "No zero digit: the first symbol is 1, as in spreadsheet columns",
          decode: true,
        },
        {
          name: "width",
          type: "number",
          required: false,
          description: "Bytes to fill with leading zeros; a number that needs more is refused",
          decode: true,
          narrows: true,
        },
      ],
    },
    (bytes, values) => integer.encode(bytes, integerOptions(values)),
    (text, values) =>
      integer.decode(text, {
        ...integerOptions(values),
        ...(values["width"] === undefined ? {} : { width: Number(values["width"]) }),
      }),
  ),
  define(
    "hex",
    {
      label: "Hex (Base16)",
      description:
        "Two hex digits per byte, or one U+ number per code point; decoding takes either case, spaces and a 0x prefix",
      family: "hex",
      standard: "RFC 4648 §8; Unicode code points",
      alphabet: "0123456789abcdef",
      options: [
        {
          name: "codepoints",
          type: "boolean",
          required: false,
          default: false,
          description:
            "Each number is a Unicode code point of UTF-8 text, such as U+017C or 17c for ż; encoding writes U+017C",
          decode: true,
        },
        {
          name: "upper",
          type: "boolean",
          required: false,
          default: false,
          description: "Write A-F instead of a-f",
        },
      ],
    },
    (bytes, values) =>
      hex.encode(bytes, {
        codepoints: values["codepoints"] === true,
        upper: values["upper"] === true,
      }),
    (text, values) => hex.decode(text, { codepoints: values["codepoints"] === true }),
  ),
  define(
    "base32",
    {
      label: "Base32",
      description: "Five bits per character in one of four alphabets; RFC 4648 pads with =",
      family: "base32",
      standard: "RFC 4648 §6 and §7, Crockford's Base32, z-base-32",
      alphabet: BASE32_RFC,
      padding: true,
      options: [
        {
          name: "alphabet",
          type: "string",
          required: false,
          default: "standard",
          choices: [...BASE32_ALPHABETS],
          description:
            "standard A-Z 2-7 (RFC 4648 §6), hex 0-9 A-V (§7), crockford (no I, L, O, U; reads its look-alikes and hyphens) or z (z-base-32)",
          decode: true,
        },
        {
          name: "padding",
          type: "boolean",
          required: false,
          default: true,
          description: "Pad the last block with = to eight characters; standard and hex only",
        },
        CANONICAL,
      ],
    },
    (bytes, values) =>
      base32.encode(bytes, {
        alphabet: String(values["alphabet"]) as Base32Alphabet,
        padding: values["padding"] === true,
      }),
    (text, values) =>
      base32.decode(text, {
        alphabet: String(values["alphabet"]) as Base32Alphabet,
        canonical: values["canonical"] === true,
      }),
  ),
  define(
    "base45",
    {
      label: "Base45",
      description:
        "Two bytes as three characters from the QR alphanumeric set; EU COVID certificates",
      family: "base45",
      standard: "RFC 9285",
      alphabet: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:",
    },
    (bytes) => base45.encode(bytes),
    (text) => base45.decode(text),
  ),
  define(
    "base58",
    {
      label: "Base58",
      description:
        "Bytes as one base-58 number; Bitcoin addresses and WIF with check, Solana keys, Monero blocks",
      family: "base58",
      standard:
        "Bitcoin Core base58.cpp, Monero common/base58.cpp, Flickr short URLs, XRP Ledger addresses",
      alphabet: BASE58_ALPHABET,
      options: [
        {
          name: "alphabet",
          type: "string",
          required: false,
          default: "bitcoin",
          choices: [...BASE58_ALPHABETS],
          description:
            "bitcoin (no 0, O, I, l), flickr (lowercase before uppercase) or ripple (XRP Ledger, addresses start with r)",
          decode: true,
        },
        {
          name: "check",
          type: "boolean",
          required: false,
          default: false,
          description:
            "Base58Check: add a 4-byte double SHA-256 checksum, and check and strip it when reading",
          decode: true,
          checksum: true,
        },
        {
          name: "blocks",
          type: "boolean",
          required: false,
          default: false,
          description:
            "Monero's block form: every 8 bytes as 11 characters, so a 69-byte address is 95 long",
          decode: true,
        },
      ],
    },
    (bytes, values) => base58.encode(bytes, base58Options(values)),
    (text, values) => base58.decode(text, base58Options(values)),
  ),
  define(
    "base64",
    {
      label: "Base64",
      description: "Letters, digits, + and /, or - and _ in the url alphabet, padded with =",
      family: "base64",
      standard: "RFC 4648 §4 and §5",
      alphabet: `${BASE64_RFC}+/`,
      padding: true,
      options: [
        {
          name: "alphabet",
          type: "string",
          required: false,
          default: "standard",
          choices: [...BASE64_ALPHABETS],
          description: "standard (+ and /) or url (- and _, safe in URLs and file names)",
          decode: true,
        },
        {
          name: "padding",
          type: "boolean",
          required: false,
          default: true,
          description: "Pad the last block with = to four characters",
        },
        CANONICAL,
      ],
    },
    (bytes, values) =>
      base64.encode(bytes, {
        alphabet: String(values["alphabet"]) as Base64Alphabet,
        padding: values["padding"] === true,
      }),
    (text, values) =>
      base64.decode(text, {
        alphabet: String(values["alphabet"]) as Base64Alphabet,
        canonical: values["canonical"] === true,
      }),
  ),
  define(
    "base85",
    {
      label: "Base85",
      description: "Four bytes as five characters; git and Python, Ascii85 for PDF, Z85 for ZeroMQ",
      family: "base85",
      standard: "RFC 1924 alphabet in git's grouping, Adobe Ascii85, ZeroMQ RFC 32/Z85",
      alphabet:
        "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!#$%&()*+-;<=>?@^_`{|}~",
      options: [
        {
          name: "alphabet",
          type: "string",
          required: false,
          default: "rfc1924",
          choices: [...BASE85_ALPHABETS],
          description:
            "rfc1924 (git, Python b85encode), ascii85 (! to u, z for zeros; PostScript, PDF) or z85 (ZeroMQ, whole 4-byte groups)",
          decode: true,
        },
        {
          name: "delimiters",
          type: "boolean",
          required: false,
          default: false,
          description: "Wrap the text in Adobe's <~ and ~>; ascii85 only",
        },
      ],
    },
    (bytes, values) =>
      base85.encode(bytes, {
        alphabet: String(values["alphabet"]) as Base85Alphabet,
        delimiters: values["delimiters"] === true,
      }),
    (text, values) =>
      base85.decode(text, { alphabet: String(values["alphabet"]) as Base85Alphabet }),
  ),
  define(
    "base91",
    {
      label: "basE91",
      description: "13 or 14 bits per two printable characters, about 23% overhead",
      family: "base91",
      standard: "Joachim Henke, basE91 reference implementation (base91.sourceforge.net)",
      alphabet:
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&()*+,./:;<=>?@[]^_`{|}~"',
    },
    (bytes) => base91.encode(bytes),
    (text) => base91.decode(text),
  ),
  define(
    "base256",
    {
      label: "Base256",
      description:
        "One symbol per byte: an emoji in base256emoji, or any table of 2 to 256 symbols as digits",
      family: "base256",
      standard: "multiformats base256emoji",
      alphabet: base256.encode(Uint8Array.from({ length: 256 }, (_, value) => value)),
      options: [
        {
          name: "alphabet",
          type: "string",
          required: false,
          default: "emoji",
          choices: [...BASE256_ALPHABETS],
          description: "emoji, the base256emoji table of multiformats",
          decode: true,
        },
        {
          name: "symbols",
          type: "string",
          required: false,
          description:
            "Symbols for 0 upward in place of the alphabet, 2 to 256 of them; fewer read as digits",
          decode: true,
        },
        {
          name: "sample",
          type: "string",
          required: false,
          description: "Text whose symbols, in order of first appearance, make the table",
          decode: true,
        },
        {
          name: "multibase",
          type: "boolean",
          required: false,
          default: false,
          description: "The 🚀 multibase prefix of base256emoji",
          decode: true,
        },
      ],
    },
    (bytes, values) => base256.encode(bytes, base256Options(values)),
    (text, values) => base256.decode(text, base256Options(values)),
  ),
  define(
    "bech32",
    {
      label: "Bech32",
      description:
        "Prefix, 1, 5-bit words and a BCH checksum; segwit, Taproot with m, Lightning, Nostr",
      family: "bech32",
      standard: "BIP173, BIP350 (Bech32m)",
      alphabet: "qpzry9x8gf2tvdw0s3jn54khce6mua7l",
      checksum: true,
      options: [
        {
          name: "prefix",
          type: "string",
          required: true,
          description: "Human-readable part, such as bc, tb or npub",
        },
        {
          name: "limit",
          type: "number",
          required: false,
          default: BECH32_LIMIT,
          description: "Longest result allowed; BIP173 sets 90, Lightning invoices need more",
        },
        {
          name: "m",
          type: "boolean",
          required: false,
          default: false,
          description: "Bech32m, the BIP350 checksum of segwit v1 and later (Taproot)",
          decode: true,
        },
      ],
    },
    (bytes, values) =>
      (values["m"] === true ? bech32m : bech32).encode(
        String(values["prefix"]),
        bytes,
        Number(values["limit"]),
      ),
    (text, values) => readBech32(text, values["m"] === true),
  ),
  define(
    "uuencode",
    {
      label: "uuencode",
      description: "Unix-to-Unix encoding: begin line, length-led lines of 45 bytes, end",
      family: "uuencode",
      standard: "POSIX uuencode(1) and uudecode(1)",
      alphabet: "`!\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_",
      options: [
        {
          name: "name",
          type: "string",
          required: false,
          default: "data",
          description: "File name on the begin line",
        },
        {
          name: "mode",
          type: "string",
          required: false,
          default: "644",
          description: "Octal permissions on the begin line",
        },
      ],
    },
    (bytes, values) =>
      uuencode.encode(bytes, { name: String(values["name"]), mode: String(values["mode"]) }),
    (text): Decoded => {
      const header = /^begin ([0-7]{3,4}) (.+)$/mu.exec(text);
      const bytes = uuencode.decode(text);
      return {
        bytes,
        details: header ? { mode: header[1]!, name: header[2]!.replace(/\r$/u, "") } : {},
      };
    },
  ),
  define(
    "quoted-printable",
    {
      label: "Quoted-Printable",
      description: "MIME encoding for mostly-ASCII text: =XX escapes and = soft line breaks",
      family: "quoted-printable",
      standard: "RFC 2045 §6.7",
      alphabet: PRINTABLE_ASCII,
    },
    (bytes) => quotedPrintable.encode(bytes),
    (text) => quotedPrintable.decode(text),
  ),
  define(
    "html",
    {
      label: "HTML character references",
      description:
        "Text with &amp; and friends; decoding reads every named, decimal and hex reference",
      family: "html",
      standard: "WHATWG HTML, named and numeric character references",
      alphabet: PRINTABLE_ASCII,
      options: [
        {
          name: "ascii",
          type: "boolean",
          required: false,
          default: false,
          description: "Also write every character past ASCII as a hex reference, such as &#xE9;",
        },
      ],
    },
    (bytes, values) => html.encode(bytes, { ascii: values["ascii"] === true }),
    (text) => html.decode(text),
  ),
  define(
    "ita2",
    {
      label: "ITA2 (Baudot-Murray)",
      description:
        "Five-bit teleprinter code with letters and figures shifts; ITA1 and US-TTY tables too",
      family: "ita2",
      standard: "ITU-T S.1 (ITA2); CCITT-1 (ITA1); US-TTY",
      alphabet: "01",
      options: [
        {
          name: "alphabet",
          type: "string",
          required: false,
          default: "ita2",
          choices: [...ITA2_ALPHABETS],
          description: "ita2, Baudot's ita1, or us-tty, which differs from ita2 in eight figures",
          decode: true,
        },
        {
          name: "order",
          type: "string",
          required: false,
          default: "msb",
          choices: ["msb", "lsb"],
          description: "msb writes element 5 first, as most tables do; lsb element 1, as ITU-T S.1",
          decode: true,
        },
        {
          name: "numbers",
          type: "boolean",
          required: false,
          default: false,
          description: "Codes as decimal numbers from 0 to 31 in place of bits",
          decode: true,
        },
        {
          name: "separate",
          type: "boolean",
          required: false,
          default: true,
          description: "Put a space between codes written as bits",
        },
      ],
    },
    (bytes, values) =>
      ita2.encode(bytes, { ...ita2Options(values), separate: values["separate"] === true }),
    (text, values) => ita2.decode(text, ita2Options(values)),
  ),
  define(
    "prefix",
    {
      label: "Prefix code",
      description:
        "Variable-length codewords from a codebook, or truncated binary, unary and Elias gamma",
      family: "prefix",
      standard: "Kraft-McMillan inequality; Elias, IEEE Trans. Inf. Theory 21 (1975)",
      alphabet: "01",
      options: [
        {
          name: "codebook",
          type: "string",
          required: false,
          description:
            'Codewords by symbol, such as A=0 B=10 C=11, or a JSON object such as {" ":"0"}',
          decode: true,
        },
        {
          name: "code",
          type: "string",
          required: false,
          choices: [...PREFIX_CODES],
          description:
            "In place of a codebook: truncated binary for n symbols from 0, unary from 0 or Elias gamma from 1",
          decode: true,
        },
        {
          name: "n",
          type: "number",
          required: false,
          description: "Truncated binary: how many symbols, from 2",
          decode: true,
        },
        {
          name: "separate",
          type: "boolean",
          required: false,
          default: false,
          description: "Put a space between codewords",
        },
      ],
    },
    (bytes, values) =>
      prefix.encode(bytes, { ...prefixOptions(values), separate: values["separate"] === true }),
    readPrefix,
  ),
  define(
    "square",
    {
      label: "Chess squares",
      description: "Squares such as e4, one byte each from 0 to 63, a1 = 0 rank by rank by default",
      family: "chess",
      standard: "FIDE Laws of Chess, Appendix C (algebraic notation)",
      alphabet: "abcdefgh12345678",
      options: [
        {
          name: "layout",
          type: "string",
          required: false,
          default: "a1",
          choices: [...CHESS_LAYOUTS],
          description: "a1 = 0 rank by rank, a8 = 0 as FEN reads the board, or file by file",
          decode: true,
        },
        {
          name: "pairs",
          type: "boolean",
          required: false,
          default: false,
          description: "Squares as (file, rank) pairs counted from 0, such as (4, 3) for e4",
          decode: true,
        },
        {
          name: "bitboard",
          type: "boolean",
          required: false,
          default: false,
          description: "The squares as one bitboard: 8 bytes big-endian, bit i for square i",
          decode: true,
        },
      ],
    },
    (bytes, values) => square.encode(bytes, squareOptions(values)),
    (text, values) => square.decode(text, squareOptions(values)),
  ),
  define(
    "fen",
    {
      label: "FEN",
      description: "Chess positions: the board as 64 bytes, a piece letter or . per square",
      family: "chess",
      standard: "PGN Standard §16.1 (Forsyth-Edwards Notation)",
      alphabet: "PNBRQKpnbrqk0123456789/ .-wacdefgh",
      options: [
        {
          name: "layout",
          type: "string",
          required: false,
          default: "a1",
          choices: [...CHESS_LAYOUTS],
          description: "Which square is byte 0: a1 rank by rank, a8 as FEN reads, or file by file",
          decode: true,
        },
        {
          name: "diagram",
          type: "boolean",
          required: false,
          default: false,
          description: "The board as eight lines of pieces and dots, rank 8 first, no fields",
          decode: true,
        },
        {
          name: "turn",
          type: "string",
          required: false,
          choices: [...FEN_TURNS],
          description: "Side to move, w or b (default w)",
        },
        {
          name: "castling",
          type: "string",
          required: false,
          description: "Castling rights, such as KQkq, or - for none (default -)",
        },
        {
          name: "enPassant",
          type: "string",
          required: false,
          description: "En passant target square on rank 3 or 6, or - (default -)",
        },
        {
          name: "halfmove",
          type: "number",
          required: false,
          description: "Halfmoves since the last capture or pawn move (default 0)",
        },
        {
          name: "fullmove",
          type: "number",
          required: false,
          description: "Move number, from 1 (default 1)",
        },
      ],
    },
    (bytes, values) => fen.encode(bytes, fenEncodeOptions(values)),
    readFen,
  ),
];
