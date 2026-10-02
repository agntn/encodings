import { base32, base32crockford, base32hex, zbase32 } from "./base32.ts";
import { base45 } from "./base45.ts";
import { BASE58_ALPHABET, base58, base58check, base58flickr, base58ripple } from "./base58.ts";
import { base64, base64url } from "./base64.ts";
import { ascii85, z85 } from "./base85.ts";
import { base91 } from "./base91.ts";
import {
  BECH32_LIMIT,
  bech32,
  bech32m,
  segwit,
  type Bech32Codec,
  type SegwitAddress,
} from "./bech32.ts";
import { binary } from "./binary.ts";
import { toBytes, type BytesInput } from "./bytes.ts";
import { InvalidOptionError } from "./errors.ts";
import { hex } from "./hex.ts";
import { quotedPrintable } from "./quoted-printable.ts";
import type { Decoded, EncodeOptions, Encoding, EncodingInfo, EncodingOption } from "./types.ts";
import { uuencode } from "./uuencode.ts";

/** Metadata of a built-in, without the fields every one fills the same way. */
type About = Omit<EncodingInfo, "name" | "checksum" | "padding" | "options"> &
  Partial<Pick<EncodingInfo, "checksum" | "padding" | "options">>;

/** Checked option values, by option name. */
type Values = Readonly<Record<string, string | number | boolean>>;

/**
 * Checks one value the caller passed against the option it names.
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
 * @param read - Decodes text.
 * @returns {Encoding} The encoding.
 */
function define(
  name: string,
  about: About,
  write: (bytes: Uint8Array, values: Values) => string,
  read: (text: string) => Decoded | Uint8Array,
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
    decode(text: string) {
      const result = read(text);
      return result instanceof Uint8Array ? { bytes: result, details: {} } : result;
    },
  };
}

const LIMIT_OPTION: EncodingOption = {
  name: "limit",
  type: "number",
  required: false,
  default: BECH32_LIMIT,
  description: "Longest result allowed; BIP173 sets 90, Lightning invoices need more",
};

/**
 * A bech32 variant for the registry. Decoding prefers the segwit reading when the text is a
 * valid segwit address of this variant, and returns the program with its version; otherwise it
 * returns the bytes the words carry.
 *
 * @param name - `bech32` or `bech32m`.
 * @param codec - The variant's codec.
 * @param about - Metadata.
 * @returns {Encoding} The encoding.
 */
function defineBech32(name: string, codec: Bech32Codec, about: About): Encoding {
  return define(
    name,
    about,
    (bytes, values) => codec.encode(String(values["prefix"]), bytes, Number(values["limit"])),
    (text): Decoded => {
      const address = segwitAddress(text, name === "bech32");
      if (address) {
        return {
          bytes: address.program,
          details: { prefix: address.prefix, witnessVersion: address.version },
        };
      }
      const { prefix, bytes } = codec.decode(text, Math.max(text.length, BECH32_LIMIT));
      return { bytes, details: { prefix } };
    },
  );
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
      description: "A-Z and 2-7, padded with = to blocks of eight",
      family: "base32",
      standard: "RFC 4648 §6",
      alphabet: BASE32_RFC,
      padding: true,
      options: [
        {
          name: "padding",
          type: "boolean",
          required: false,
          default: true,
          description: "Pad the last block with = to eight characters",
        },
      ],
    },
    (bytes, values) => base32.encode(bytes, { padding: values["padding"] === true }),
    (text) => base32.decode(text),
  ),
  define(
    "base32hex",
    {
      label: "Base32hex",
      description: "Base32 with 0-9 and A-V, so the text sorts in byte order",
      family: "base32",
      standard: "RFC 4648 §7",
      alphabet: "0123456789ABCDEFGHIJKLMNOPQRSTUV",
      padding: true,
      options: [
        {
          name: "padding",
          type: "boolean",
          required: false,
          default: true,
          description: "Pad the last block with = to eight characters",
        },
      ],
    },
    (bytes, values) => base32hex.encode(bytes, { padding: values["padding"] === true }),
    (text) => base32hex.decode(text),
  ),
  define(
    "base32-crockford",
    {
      label: "Crockford's Base32",
      description: "Base32 without I, L, O and U; decoding ignores case and hyphens",
      family: "base32",
      standard: "Douglas Crockford, Base32 (crockford.com/base32.html)",
      alphabet: "0123456789ABCDEFGHJKMNPQRSTVWXYZ",
    },
    (bytes) => base32crockford.encode(bytes),
    (text) => base32crockford.decode(text),
  ),
  define(
    "z-base-32",
    {
      label: "z-base-32",
      description: "Lowercase Base32 ordered for people to read and say; Mnet, Lightning",
      family: "base32",
      standard: "Zooko O'Whielacronx, human-oriented base-32 encoding (2002)",
      alphabet: "ybndrfg8ejkmcpqxot1uwisza345h769",
    },
    (bytes) => zbase32.encode(bytes),
    (text) => zbase32.decode(text),
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
      description: "Bitcoin's alphabet without 0, O, I and l; Solana keys, IPFS CIDv0",
      family: "base58",
      standard: "Bitcoin Core base58.cpp",
      alphabet: BASE58_ALPHABET,
    },
    (bytes) => base58.encode(bytes),
    (text) => base58.decode(text),
  ),
  define(
    "base58check",
    {
      label: "Base58Check",
      description: "Base58 with a 4-byte double SHA-256 checksum; Bitcoin addresses, WIF, xpub",
      family: "base58",
      standard: "Bitcoin Core base58.cpp (EncodeBase58Check)",
      alphabet: BASE58_ALPHABET,
      checksum: true,
    },
    (bytes) => base58check.encode(bytes),
    (text) => base58check.decode(text),
  ),
  define(
    "base58-flickr",
    {
      label: "Base58 (Flickr)",
      description: "Base58 with lowercase before uppercase, as Flickr short URLs write it",
      family: "base58",
      standard: "Flickr short URLs (flic.kr)",
      alphabet: "123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ",
    },
    (bytes) => base58flickr.encode(bytes),
    (text) => base58flickr.decode(text),
  ),
  define(
    "base58-ripple",
    {
      label: "Base58 (Ripple)",
      description: "Base58 with the XRP Ledger's alphabet, where addresses start with r",
      family: "base58",
      standard: "XRP Ledger address encoding",
      alphabet: "rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz",
    },
    (bytes) => base58ripple.encode(bytes),
    (text) => base58ripple.decode(text),
  ),
  define(
    "base64",
    {
      label: "Base64",
      description: "Letters, digits, + and /, padded with =; decoding skips line breaks",
      family: "base64",
      standard: "RFC 4648 §4",
      alphabet: `${BASE64_RFC}+/`,
      padding: true,
    },
    (bytes) => base64.encode(bytes),
    (text) => base64.decode(text),
  ),
  define(
    "base64url",
    {
      label: "Base64url",
      description: "Base64 with - and _ for URLs and file names, unpadded as JWT writes it",
      family: "base64",
      standard: "RFC 4648 §5",
      alphabet: `${BASE64_RFC}-_`,
    },
    (bytes) => base64url.encode(bytes),
    (text) => base64url.decode(text),
  ),
  define(
    "ascii85",
    {
      label: "Ascii85",
      description: "Four bytes as five characters from ! to u, z for zeros; PostScript and PDF",
      family: "base85",
      standard: "Adobe PostScript Language Reference, ASCII85Decode",
      alphabet:
        "!\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstu",
      options: [
        {
          name: "delimiters",
          type: "boolean",
          required: false,
          default: false,
          description: "Wrap the text in Adobe's <~ and ~>",
        },
      ],
    },
    (bytes, values) => ascii85.encode(bytes, { delimiters: values["delimiters"] === true }),
    (text) => ascii85.decode(text),
  ),
  define(
    "z85",
    {
      label: "Z85",
      description: "ZeroMQ's base85 with a source-safe alphabet; whole 4-byte groups only",
      family: "base85",
      standard: "ZeroMQ RFC 32/Z85",
      alphabet:
        "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.-:+=^!/*?&<>()[]{}@%$#",
    },
    (bytes) => z85.encode(bytes),
    (text) => z85.decode(text),
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
  defineBech32("bech32", bech32, {
    label: "Bech32",
    description: "Prefix, 1, 5-bit words and a BCH checksum; segwit v0, Lightning, Nostr, Cosmos",
    family: "bech32",
    standard: "BIP173",
    alphabet: "qpzry9x8gf2tvdw0s3jn54khce6mua7l",
    checksum: true,
    options: [
      {
        name: "prefix",
        type: "string",
        required: true,
        description: "Human-readable part, such as bc, tb or npub",
      },
      LIMIT_OPTION,
    ],
  }),
  defineBech32("bech32m", bech32m, {
    label: "Bech32m",
    description: "Bech32 with the BIP350 checksum constant; segwit v1+ (Taproot)",
    family: "bech32",
    standard: "BIP350",
    alphabet: "qpzry9x8gf2tvdw0s3jn54khce6mua7l",
    checksum: true,
    options: [
      {
        name: "prefix",
        type: "string",
        required: true,
        description: "Human-readable part, such as bc or tb",
      },
      LIMIT_OPTION,
    ],
  }),
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
