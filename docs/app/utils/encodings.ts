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
  "base32-crockford",
  "z-base-32",
  "base45",
  "base58",
  "base58check",
  "base58-flickr",
  "base58-ripple",
  "base64",
  "ascii85",
  "z85",
  "base85",
  "base91",
  "bech32",
  "bech32m",
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
    blurb: "Letters and 2 to 7, survives a case-blind file system",
    usedBy: "TOTP secrets, Onion v3",
  },
  "base32-crockford": {
    icon: "i-lucide-spell-check",
    blurb: "Base32 for people: no I, L, O or U to misread",
    usedBy: "ULID",
  },
  "z-base-32": {
    icon: "i-lucide-megaphone",
    blurb: "Base32 ordered so you can read it out loud",
    usedBy: "Lightning, Mnet",
  },
  base45: { icon: "i-lucide-qr-code", blurb: "Fits the alphanumeric mode of a QR code", usedBy: "EU COVID certificates" },
  base58: { icon: "i-token-sol", blurb: "No 0, O, I or l. Nothing to confuse", usedBy: "Solana, IPFS CIDv0" },
  base58check: {
    icon: "i-token-btc",
    blurb: "Base58 with four bytes of double SHA-256 on the end",
    usedBy: "Bitcoin, Litecoin, Dogecoin",
  },
  "base58-flickr": { icon: "i-lucide-image", blurb: "Base58 with the cases swapped", usedBy: "flic.kr" },
  "base58-ripple": { icon: "i-token-xrp", blurb: "Base58 shuffled so addresses start with r", usedBy: "XRP Ledger" },
  base64: { icon: "i-lucide-file-code", blurb: "Three bytes as four characters. MIME, data URLs, PEM" },
  ascii85: { icon: "i-lucide-file-text", blurb: "Four bytes as five, z for zeros", usedBy: "PostScript, PDF" },
  z85: { icon: "i-lucide-code-xml", blurb: "Base85 safe to paste into source code", usedBy: "ZeroMQ" },
  base85: { icon: "i-lucide-git-compare", blurb: "The RFC 1924 alphabet in four byte groups", usedBy: "Python, Mercurial, git patches" },
  base91: { icon: "i-lucide-package", blurb: "Squeezes printable ASCII hardest" },
  bech32: {
    icon: "i-lucide-fingerprint",
    blurb: "A BCH checksum that catches four typos",
    usedBy: "SegWit v0, Lightning, Nostr, Cosmos",
  },
  bech32m: { icon: "i-token-btc", blurb: "Bech32 with the length bug fixed", usedBy: "Taproot" },
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
  "base32-crockford": "bits",
  "z-base-32": "bits",
  base64: "bits",
  base58: "number",
  base58check: "number",
  "base58-flickr": "number",
  "base58-ripple": "number",
  base45: "blocks",
  ascii85: "blocks",
  z85: "blocks",
  base85: "blocks",
  base91: "blocks",
  bech32: "words",
  bech32m: "words",
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

/** The built-ins whose text carries a checksum, counted from `info().checksum`. */
export const CHECKSUM_COUNT = ENCODINGS.filter((encoding) => encoding.info.checksum).length;

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
  bech32m: { prefix: "hi" },
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
 * The codec object a family subpath exports for an encoding: `base58check` from
 * `@agntn/encodings/base58`, `zbase32` for z-base-32, `quotedPrintable` for quoted-printable.
 *
 * @param {EncodingEntry} entry - A built-in.
 * @returns {string} The export name.
 */
export function codecExport(entry: EncodingEntry): string {
  if (entry.slug === "z-base-32") return "zbase32";
  if (entry.slug === "quoted-printable") return "quotedPrintable";
  return entry.slug.replaceAll("-", "");
}
