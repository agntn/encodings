import type { BytesInput } from "./bytes.ts";

/** Families the built-in encodings belong to, by the radix or scheme they share. */
export const encodingFamilies = [
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

/** Family of an encoding. Registered encodings may name others. */
export type EncodingFamily = (typeof encodingFamilies)[number] | (string & {});

/** Option descriptor for the CLI and the tool descriptions. */
export interface EncodingOption {
  name: string;
  type: "number" | "string" | "boolean";
  required: boolean;
  default?: number | string | boolean;
  description: string;
}

/** Metadata about an encoding. */
export interface EncodingInfo {
  /** Registry name, such as `base58check`. */
  name: string;
  /** Human-readable label. */
  label: string;
  /** One-line description. */
  description: string;
  /** Family the encoding belongs to. */
  family: EncodingFamily;
  /** Document that defines it: an RFC, a BIP or the reference implementation. */
  standard: string;
  /** Characters the encoded text is made of, padding and framing aside. */
  alphabet: string;
  /** Whether the text carries a checksum that decoding verifies. */
  checksum: boolean;
  /** Whether encoding pads the text with `=`. */
  padding: boolean;
  /** Options `encode` takes. */
  options: EncodingOption[];
}

/** Option values for `encode`, checked against the encoding's descriptors. */
export type EncodeOptions = Readonly<Record<string, string | number | boolean | undefined>>;

/** Bytes a text decoded to, with what else the text carried. */
export interface Decoded {
  /** Decoded bytes. */
  bytes: Uint8Array;
  /** Parts of the text that are not data, such as a bech32 prefix or a uuencode file name. */
  details: Record<string, string | number>;
}

/** An encoding the registry can create. */
export interface Encoding {
  /** Registry name. */
  readonly name: string;
  /** Metadata. */
  info(): EncodingInfo;
  /**
   * Writes text or bytes in this encoding.
   * @param input - Text, read as UTF-8, or bytes.
   * @param options - Options from `info().options`.
   */
  encode(input: BytesInput, options?: EncodeOptions): string;
  /**
   * Reads text in this encoding.
   * @param text - Encoded text.
   */
  decode(text: string): Decoded;
}
