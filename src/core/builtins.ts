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
import { BECH32_LIMIT, bech32, bech32m, segwit, type SegwitAddress } from "./bech32.ts";
import { binary } from "./binary.ts";
import { toBytes, type BytesInput } from "./bytes.ts";
import { decimal } from "./decimal.ts";
import { InvalidOptionError } from "./errors.ts";
import { hex } from "./hex.ts";
import { octal } from "./octal.ts";
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
    if (option.required) throw new InvalidOptionError(option.name, undefined, "is required");
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
  return {
    name,
    info: () => structuredClone(info),
    encode: (input: BytesInput, options?: EncodeOptions) =>
      write(toBytes(input), checked(info.options, options)),
    decode(text: string, options?: DecodeOptions) {
      const reading = info.options.filter((option) => option.decode === true);
      const result = read(text, checked(reading, options));
      return result instanceof Uint8Array ? { bytes: result, details: {} } : result;
    },
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
      ],
    },
    (bytes, values) => binary.encode(bytes, { separate: values["separate"] === true }),
    (text) => binary.decode(text),
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
      description: "One decimal number from 0 to 255 per byte, spaced; decoding also takes commas",
      family: "decimal",
      standard: "Byte values in base 10",
      alphabet: "0123456789",
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
    (bytes, values) => decimal.encode(bytes, { separate: values["separate"] === true }),
    (text) => decimal.decode(text),
  ),
  define(
    "hex",
    {
      label: "Hex (Base16)",
      description: "Two hex digits per byte; decoding takes either case, spaces and a 0x prefix",
      family: "hex",
      standard: "RFC 4648 §8",
      alphabet: "0123456789abcdef",
      options: [
        {
          name: "upper",
          type: "boolean",
          required: false,
          default: false,
          description: "Write A-F instead of a-f",
        },
      ],
    },
    (bytes, values) => hex.encode(bytes, { upper: values["upper"] === true }),
    (text) => hex.decode(text),
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
      ],
    },
    (bytes, values) =>
      base32.encode(bytes, {
        alphabet: String(values["alphabet"]) as Base32Alphabet,
        padding: values["padding"] === true,
      }),
    (text, values) =>
      base32.decode(text, { alphabet: String(values["alphabet"]) as Base32Alphabet }),
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
      description: "Bytes as one base-58 number; Bitcoin addresses and WIF with check, Solana keys",
      family: "base58",
      standard: "Bitcoin Core base58.cpp, Flickr short URLs, XRP Ledger address encoding",
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
      ],
    },
    (bytes, values) =>
      base64.encode(bytes, {
        alphabet: String(values["alphabet"]) as Base64Alphabet,
        padding: values["padding"] === true,
      }),
    (text, values) =>
      base64.decode(text, { alphabet: String(values["alphabet"]) as Base64Alphabet }),
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
];
