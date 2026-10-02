import {
  create,
  encodingFamilies,
  encodings,
  type EncodingFamily,
  type EncodingInfo,
} from "@agntn/encodings";

/** The built-in names, typed from the registry as the page loads it. */
type BuiltinEncoding = (typeof BUILTINS)[number];

/** Built-ins in listing order. A newcomer without a row in `PRESENTATION` fails the type below. */
const BUILTINS = [
  "binary",
  "octal",
  "decimal",
  "hex",
  "base32",
  "base45",
  "base58",
  "base64",
  "base85",
  "base91",
  "bech32",
  "uuencode",
  "quoted-printable",
] as const;

/** An icon, a one-liner and who writes it, per encoding. Everything else comes from `info()`. */
const PRESENTATION: Record<BuiltinEncoding, { icon: string; blurb: string; usedBy?: string }> = {
  binary: { icon: "i-lucide-binary", blurb: "Every bit spelled out. Eight characters a byte" },
  octal: { icon: "i-lucide-octagon", blurb: "A number a byte in base 8. Looks like decimal, isn't" },
  decimal: { icon: "i-lucide-list-ordered", blurb: "A number a byte. The ASCII table, written out" },
  hex: { icon: "i-lucide-hash", blurb: "Two digits a byte. The one everybody reads" },
  base32: {
    icon: "i-lucide-case-upper",
    blurb: "Five bits a character, in four alphabets. Survives a case-blind file system",
    usedBy: "TOTP secrets, Onion v3, ULID, Lightning",
  },
  base45: { icon: "i-lucide-qr-code", blurb: "Fits the alphanumeric mode of a QR code", usedBy: "EU COVID certificates" },
  base58: {
    icon: "i-token-btc",
    blurb: "No 0, O, I or l. With check, the Bitcoin address you know",
    usedBy: "Bitcoin, Solana, IPFS CIDv0, XRP Ledger",
  },
  base64: { icon: "i-lucide-file-code", blurb: "Three bytes as four characters. MIME, data URLs, PEM" },
  base85: {
    icon: "i-lucide-git-compare",
    blurb: "Four bytes as five characters, in three alphabets",
    usedBy: "Python, git patches, PDF, ZeroMQ",
  },
  base91: { icon: "i-lucide-package", blurb: "Squeezes printable ASCII hardest" },
  bech32: {
    icon: "i-lucide-fingerprint",
    blurb: "A BCH checksum that catches four typos",
    usedBy: "SegWit, Taproot, Lightning, Nostr, Cosmos",
  },
  uuencode: { icon: "i-lucide-mail", blurb: "How Usenet mailed binaries before MIME" },
  "quoted-printable": { icon: "i-lucide-quote", blurb: "Mostly text stays text, the rest gets =XX", usedBy: "Email" },
};

/** Labels a page shows per family. The keys come from the library. */
const FAMILY_LABELS: Record<(typeof encodingFamilies)[number], string> = {
  binary: "Binary",
  octal: "Octal",
  decimal: "Decimal",
  hex: "Hex",
  base32: "Base32",
  base45: "Base45",
  base58: "Base58",
  base64: "Base64",
  base85: "Base85",
  base91: "basE91",
  bech32: "Bech32",
  uuencode: "uuencode",
  "quoted-printable": "Quoted-Printable",
};

/** How the landing groups the registry: by how an encoding turns bytes into text. */
export const GROUPS = [
  { key: "bits", label: "Bit groups", about: "a fixed number of bits per character" },
  { key: "values", label: "Byte values", about: "each byte as one number, spaced" },
  { key: "number", label: "Big number", about: "the whole input as one number in base 58" },
  { key: "blocks", label: "Fixed blocks", about: "a few bytes at a time as a few characters" },
  { key: "words", label: "Checksummed words", about: "5-bit words behind a prefix, with a BCH checksum" },
  { key: "mail", label: "Mail", about: "line formats from before MIME and from MIME" },
] as const;

export type GroupKey = (typeof GROUPS)[number]["key"];

const GROUP_OF: Record<BuiltinEncoding, GroupKey> = {
  binary: "bits",
  octal: "values",
  decimal: "values",
  hex: "bits",
  base32: "bits",
  base64: "bits",
  base58: "number",
  base45: "blocks",
  base85: "blocks",
  base91: "blocks",
  bech32: "words",
  uuencode: "mail",
  "quoted-printable": "mail",
};

export interface EncodingEntry {
  slug: BuiltinEncoding;
  to: string;
  icon: string;
  blurb: string;
  usedBy?: string;
  group: GroupKey;
  info: EncodingInfo;
}

/** The built-in encodings in listing order, with their live metadata. */
export const ENCODINGS: readonly EncodingEntry[] = BUILTINS.map((slug) => ({
  slug,
  to: `/encodings/${slug}`,
  ...PRESENTATION[slug],
  group: GROUP_OF[slug],
  info: create(slug).info(),
}));

if (import.meta.dev && encodings().join() !== BUILTINS.join()) {
  console.warn("docs: BUILTINS in app/utils/encodings.ts no longer matches encodings()");
}

/** Families in listing order, with the label a page shows. */
export const FAMILIES: ReadonlyArray<{ key: EncodingFamily; label: string }> = encodingFamilies.map(
  (key) => ({ key, label: FAMILY_LABELS[key] }),
);

/**
 * One encoding by its registry name.
 *
 * @param {string} slug - A built-in name.
 * @returns {EncodingEntry | undefined} Undefined for a name the site doesn't ship.
 */
export function encodingEntry(slug: string): EncodingEntry | undefined {
  return ENCODINGS.find((encoding) => encoding.slug === slug);
}

/**
 * The label a page shows for a family.
 *
 * @param {EncodingFamily} family - A family as `info().family` reports it.
 * @returns {string} Its label.
 */
export function familyLabel(family: EncodingFamily): string {
  return FAMILY_LABELS[family as keyof typeof FAMILY_LABELS] ?? family;
}

/**
 * How many built-ins belong to one family.
 *
 * @param {EncodingFamily} family - A family.
 * @returns {number} The count.
 */
export function familySize(family: EncodingFamily): number {
  return ENCODINGS.filter((encoding) => encoding.info.family === family).length;
}

/**
 * The option that adds a checksum to an encoding's text, such as base58's `check`.
 *
 * @param {EncodingInfo} info - The encoding's metadata.
 * @returns {string | undefined} The option name, or nothing when there is none.
 */
export function checksumOption(info: EncodingInfo): string | undefined {
  return info.options.find((option) => option.checksum === true)?.name;
}

/** The built-ins whose text carries a checksum, always or with an option such as base58's `check`. */
export const CHECKSUM_COUNT = ENCODINGS.filter(
  (encoding) => encoding.info.checksum || checksumOption(encoding.info) !== undefined,
).length;

/**
 * One encoding's place in the registry, 1-based, the way an ID bar numbers it.
 *
 * @param {string} slug - A built-in name.
 * @returns {number} Its position.
 */
export function registryPosition(slug: string): number {
  return ENCODINGS.findIndex((encoding) => encoding.slug === slug) + 1;
}

/**
 * The alphabet as single characters, the way a cell grid shows it. Quoted-Printable's
 * "alphabet" is printable ASCII and a tab, which the grid shows as `⇥`.
 *
 * @param {EncodingInfo} info - The encoding's metadata.
 * @returns {string[]} One entry per character.
 */
export function alphabetCells(info: EncodingInfo): string[] {
  return info.alphabet.split("").map((character) => (character === "\t" ? "⇥" : character));
}

/** Options a page encodes the sample with, where the encoding needs any. */
export const SAMPLE_OPTIONS: Partial<Record<BuiltinEncoding, Record<string, string | number | boolean>>> = {
  bech32: { prefix: "hi" },
};

/** Pseudo-random bytes the overhead is measured on: enough that padding and leading zeros wash out. */
const OVERHEAD_BYTES = Uint8Array.from({ length: 600 }, (_, index) => (index * 151 + 7) % 251);

/**
 * How much longer the text is than the bytes, on a long input, as a whole percentage: base64 is
 * 33, hex 100. Whitespace and line breaks don't count, framing does.
 *
 * @param {EncodingEntry} entry - A built-in.
 * @returns {number} The overhead in percent.
 */
export function overhead(entry: EncodingEntry): number {
  const options = SAMPLE_OPTIONS[entry.slug] ?? {};
  const limit = entry.info.options.some((option) => option.name === "limit") ? { limit: 10_000 } : {};
  const text = create(entry.slug).encode(OVERHEAD_BYTES, { ...options, ...limit });
  return Math.round((text.replaceAll(/\s/gu, "").length / OVERHEAD_BYTES.length - 1) * 100);
}

/**
 * The codec object a family subpath exports for an encoding: `base58` from
 * `@agntn/encodings/base58`, `quotedPrintable` for quoted-printable.
 *
 * @param {EncodingEntry} entry - A built-in.
 * @returns {string} The export name.
 */
export function codecExport(entry: EncodingEntry): string {
  if (entry.slug === "quoted-printable") return "quotedPrintable";
  return entry.slug.replaceAll("-", "");
}
