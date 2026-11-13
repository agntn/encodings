import { MAX_SYMBOL, graphemes, requireBytes, requireText } from "./bytes.ts";
import { DecodeError, EncodingError, InvalidOptionError, named } from "./errors.ts";

/** Which bit of a byte the text writes first. */
export type BitOrder = "msb" | "lsb";

/** How binary text spells a byte. */
export interface BinaryOptions {
  /** The character for 0, then the one for 1. Default: `01`. */
  symbols?: string;
  /** Bits per byte, from 1 to 8; 7 reads 7-bit ASCII. Default: 8. */
  bits?: number;
  /** Most or least significant bit first. Default: `msb`. */
  order?: BitOrder;
}

/** Options for binary output. */
export interface BinaryEncodeOptions extends BinaryOptions {
  /** Put a space between bytes. Default: true. */
  separate?: boolean;
}

/** Checked binary options. */
interface Layout {
  zero: string;
  one: string;
  bits: number;
  lsb: boolean;
  /** Whether a symbol spans more than one code point, so the text splits into graphemes. */
  clusters: boolean;
}

/** ASCII whitespace, one grapheme of it: CR LF is a single grapheme. */
const WHITESPACE = /^[\t\n\f\r ]+$/u;

const ASCII = /^\p{ASCII}*$/u;

/**
 * Splits `symbols` into two code points, such as zero-width ones, or else two graphemes.
 *
 * @param symbols - Two characters, as the caller passed them.
 * @returns {[string, string]} The character for 0, then the one for 1.
 */
function symbolPair(symbols: string): [string, string] {
  const points = Array.from(symbols);
  const characters =
    points.length === 2 ? points : Array.from(graphemes(symbols), (entry) => entry.segment);
  const [zero = "", one = ""] = characters;
  const distinct = new Set(characters).size === 2 && characters.length === 2;
  if (!distinct || characters.some((character) => WHITESPACE.test(character))) {
    throw new InvalidOptionError("symbols", symbols, "needs two different non-space characters");
  }
  if (characters.some((character) => Array.from(character).length > MAX_SYMBOL)) {
    throw new InvalidOptionError("symbols", symbols, `has a symbol over ${MAX_SYMBOL} code points`);
  }
  return [zero, one];
}

/**
 * Checks binary options and fills in their defaults.
 *
 * @param options - Options from the caller.
 * @returns {Layout} The two symbols, the bits per byte and the order.
 */
function layout(options: Readonly<BinaryOptions>): Layout {
  const { symbols = "01", bits = 8, order = "msb" } = options;
  const [zero, one] = symbolPair(symbols);
  if (!Number.isInteger(bits) || bits < 1 || bits > 8) {
    throw new InvalidOptionError("bits", bits, "must be an integer from 1 to 8");
  }
  if (order !== "msb" && order !== "lsb") {
    throw new InvalidOptionError("order", order, "use one of msb, lsb");
  }
  const clusters = Array.from(zero + one).length > 2;
  return { zero, one, bits, lsb: order === "lsb", clusters };
}

/** Packs bits into bytes as the text gives them, so a long text never turns into a string per bit. */
class BytePacker {
  readonly #bits: number;
  readonly #lsb: boolean;
  readonly #out: Uint8Array;
  #count = 0;
  #value = 0;

  /**
   * @param checked - Bits per byte and their order.
   * @param most - Most bits the text can hold, one per code unit.
   */
  constructor(checked: Readonly<Layout>, most: number) {
    this.#bits = checked.bits;
    this.#lsb = checked.lsb;
    this.#out = new Uint8Array(Math.floor(most / checked.bits));
  }

  /**
   * Adds the next bit in text order.
   *
   * @param bit - 0 or 1.
   */
  push(bit: number): void {
    const at = this.#count % this.#bits;
    this.#value = this.#lsb ? this.#value | (bit << at) : (this.#value << 1) | bit;
    this.#count++;
    if (at === this.#bits - 1) {
      this.#out[this.#count / this.#bits - 1] = this.#value;
      this.#value = 0;
    }
  }

  /**
   * The bytes read so far, refused when the last one is short.
   *
   * @returns {Uint8Array} One byte per full group of bits.
   */
  bytes(): Uint8Array {
    if (this.#count % this.#bits !== 0) {
      const unit = this.#bits === 8 ? "bytes" : `groups of ${this.#bits}`;
      throw new DecodeError("binary", `${this.#count} bits are not whole ${unit}`);
    }
    return this.#out.slice(0, this.#count / this.#bits);
  }
}

/**
 * Reads the bits of binary text, skipping ASCII whitespace.
 *
 * @param text - Binary text.
 * @param checked - The symbols, how to split the text and how to pack the bits.
 * @returns {Uint8Array} The bytes.
 */
function bytesOf(text: string, checked: Readonly<Layout>): Uint8Array {
  const { zero, one, clusters } = checked;
  const packer = new BytePacker(checked, text.length);
  const take = (segment: string, index: number): void => {
    if (segment === zero || segment === one) packer.push(segment === one ? 1 : 0);
    else if (!WHITESPACE.test(segment)) {
      const at = [zero, one].find((symbol) => segment.startsWith(symbol))?.length ?? 0;
      const stray = String.fromCodePoint(segment.codePointAt(at)!);
      throw new DecodeError("binary", `${named(stray)} is not a bit`, index + at);
    }
  };
  if (ASCII.test(text)) {
    for (let index = 0; index < text.length; index++) take(text[index]!, index);
  } else if (clusters) {
    for (const { segment, index } of graphemes(text)) take(segment, index);
  } else {
    let index = 0;
    for (const character of text) {
      take(character, index);
      index += character.length;
    }
  }
  return packer.bytes();
}

/**
 * Base2: eight `0` and `1` digits per byte, most significant bit first. Other symbols, fewer
 * bits per byte and the reverse order are options. Decoding skips ASCII whitespace, so
 * `01001000 01101001` and `0100100001101001` read the same.
 */
export const binary = {
  /**
   * Writes bytes as bits.
   *
   * @param bytes - Bytes to write.
   * @param options - Symbols, bits per byte, order and spacing.
   * @returns {string} One group of bits per byte.
   */
  encode(bytes: Uint8Array, options: Readonly<BinaryEncodeOptions> = {}): string {
    requireBytes("binary: encode", bytes);
    const { zero, one, bits, lsb } = layout(options);
    const spelled = Array.from({ length: 2 ** bits }, (_, value) => {
      const digits = Array.from(value.toString(2).padStart(bits, "0"));
      if (lsb) digits.reverse();
      return digits.map((digit) => (digit === "1" ? one : zero)).join("");
    });
    const groups = Array.from(bytes, (byte, index) => {
      const group = spelled[byte];
      if (group === undefined) {
        throw new EncodingError(
          `binary: byte ${byte} at index ${index} needs more than ${bits} bits`,
        );
      }
      return group;
    });
    return groups.join(options.separate === false ? "" : " ");
  },

  /**
   * Reads bits as bytes.
   *
   * @param text - Bits, optionally spaced.
   * @param options - Symbols, bits per byte and order.
   * @returns {Uint8Array} The bytes.
   */
  decode(text: string, options: Readonly<BinaryOptions> = {}): Uint8Array {
    requireText("binary: decode", text);
    return bytesOf(text, layout(options));
  },
} as const;
