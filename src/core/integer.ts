import { requireBytes, requireText } from "./bytes.ts";
import { DecodeError, InvalidOptionError, named } from "./errors.ts";

/** How a whole number spells its digits. */
export interface IntegerOptions {
  /** Base 2 to 36, digits 0-9 then a-z in any case; 35 when bijective. Default: 10. */
  radix?: number;
  /** One symbol per digit, lowest first, such as `🌑🌒🌓🌔`. Case counts. */
  digits?: string;
  /** No zero digit, so the first symbol is 1: `A`, `Z`, `AA`. */
  bijective?: boolean;
}

/** Options for reading a whole number. */
export interface IntegerDecodeOptions extends IntegerOptions {
  /** Bytes to fill with leading zeros; a bigger number is refused. */
  width?: number;
}

/** Checked options: the base and what each symbol is worth. */
interface Numeral {
  radix: number;
  /** Symbol per standard digit; under `bijective` each one is worth one more. */
  symbols: readonly string[];
  values: Readonly<Record<string, number>>;
  bijective: boolean;
}

/** The default digits, the ones `Number#toString` writes. */
const STANDARD = "0123456789abcdefghijklmnopqrstuvwxyz";

const WHITESPACE = /^[\t\n\f\r ]$/u;

/**
 * Maps each symbol to its value, capitals too for the default digits.
 *
 * @param symbols - Symbols by value.
 * @param folded - Whether capitals read as the same digit.
 * @returns {Record<string, number>} Value by symbol.
 */
function valuesOf(symbols: readonly string[], folded: boolean): Record<string, number> {
  const values: Record<string, number> = {};
  symbols.forEach((symbol, value) => {
    values[symbol] = value;
    if (folded) values[symbol.toUpperCase()] = value;
  });
  return values;
}

/**
 * Checks that the base is an integer from 2 to `most`.
 *
 * @param radix - The base.
 * @param most - Largest base the digits allow.
 */
function checkRadix(radix: number, most: number): void {
  if (!Number.isInteger(radix) || radix < 2 || radix > most) {
    throw new InvalidOptionError("radix", radix, `must be an integer from 2 to ${most}`);
  }
}

/**
 * Splits `digits` into code points: two or more, distinct, no whitespace.
 *
 * @param digits - The symbols as the caller passed them.
 * @returns {string[]} One symbol per code point.
 */
function symbolsOf(digits: string): string[] {
  const symbols = Array.from(digits);
  if (symbols.length < 2 || new Set(symbols).size !== symbols.length) {
    throw new InvalidOptionError("digits", digits, "needs two or more different symbols");
  }
  const space = symbols.find((symbol) => /^\s$/u.test(symbol));
  if (space !== undefined) {
    throw new InvalidOptionError("digits", digits, `${named(space)} is whitespace`);
  }
  return symbols;
}

/**
 * Builds the numeral from the caller's own digits.
 *
 * @param digits - The symbols.
 * @param options - The rest of the options, for a `radix` that must agree.
 * @returns {Numeral} The checked numeral.
 */
function customNumeral(digits: string, options: Readonly<IntegerOptions>): Numeral {
  const symbols = symbolsOf(digits);
  if (options.radix !== undefined && options.radix !== symbols.length) {
    throw new InvalidOptionError(
      "radix",
      options.radix,
      `digits has ${symbols.length} symbols, so the base is ${symbols.length}`,
    );
  }
  const values = valuesOf(symbols, false);
  return { radix: symbols.length, symbols, values, bijective: options.bijective === true };
}

/**
 * Checks the options and fills in their defaults.
 *
 * @param options - Options from the caller.
 * @returns {Numeral} The base, its symbols and their values.
 */
function numeral(options: Readonly<IntegerOptions>): Numeral {
  if (typeof options.digits === "string") return customNumeral(options.digits, options);
  if (options.digits !== undefined) {
    throw new InvalidOptionError("digits", options.digits, "must be a string");
  }
  const bijective = options.bijective === true;
  const { radix = 10 } = options;
  checkRadix(radix, bijective ? STANDARD.length - 1 : STANDARD.length);
  const symbols = Array.from(bijective ? STANDARD.slice(1, radix + 1) : STANDARD.slice(0, radix));
  return { radix, symbols, values: valuesOf(symbols, true), bijective };
}

/**
 * Reads the digit values, skipping ASCII whitespace so a wrapped number reads whole.
 *
 * @param text - The number.
 * @param checked - The numeral.
 * @returns {number[]} Standard digit values, most significant first.
 */
function digitsOf(text: string, checked: Readonly<Numeral>): number[] {
  const out: number[] = [];
  let index = 0;
  for (const character of text) {
    const value = checked.values[character];
    if (value !== undefined) out.push(value);
    else if (!WHITESPACE.test(character)) {
      const base = `${checked.bijective ? "bijective " : ""}base ${checked.radix}`;
      throw new DecodeError("integer", `${named(character)} is not a digit in ${base}`, index);
    }
    index += character.length;
  }
  return out;
}

/**
 * Digits per limb, so every limb stays exact in a double.
 *
 * @param radix - The base.
 * @returns {number} Digits per limb.
 */
function limbWidth(radix: number): number {
  let width = 1;
  while (radix ** (width + 1) <= Number.MAX_SAFE_INTEGER) width++;
  return width;
}

/**
 * Reads digit values as one number, pairing limbs up so long numbers stay fast.
 *
 * @param digits - Digit values, most significant first.
 * @param radix - The base.
 * @returns {bigint} The number.
 */
function valueOf(digits: readonly number[], radix: number): bigint {
  const width = limbWidth(radix);
  let level: bigint[] = [];
  for (let end = digits.length; end > 0; end -= width) {
    let limb = 0;
    for (let at = Math.max(0, end - width); at < end; at++) limb = limb * radix + digits[at]!;
    level.push(BigInt(limb));
  }
  level.reverse();
  let base = BigInt(radix) ** BigInt(width);
  while (level.length > 1) {
    const next: bigint[] = level.length % 2 === 1 ? [level[0]!] : [];
    for (let at = level.length % 2; at < level.length; at += 2) {
      next.push(level[at]! * base + level[at + 1]!);
    }
    level = next;
    base *= base;
  }
  return level[0] ?? 0n;
}

/**
 * `length` ones in the base: the gap between a bijective numeral and a standard one.
 *
 * @param radix - The base.
 * @param length - How many ones.
 * @returns {bigint} The repunit.
 */
function repunit(radix: number, length: number): bigint {
  const base = BigInt(radix);
  return (base ** BigInt(length) - 1n) / (base - 1n);
}

/**
 * Writes a number as big-endian bytes; zero is no bytes.
 *
 * @param value - The number.
 * @returns {Uint8Array} The bytes.
 */
function bytesOf(value: bigint): Uint8Array {
  if (value === 0n) return new Uint8Array(0);
  const digits = value.toString(16);
  const even = digits.length % 2 === 1 ? `0${digits}` : digits;
  const out = new Uint8Array(even.length / 2);
  for (let index = 0; index < out.length; index++) {
    out[index] = Number.parseInt(even.slice(index * 2, index * 2 + 2), 16);
  }
  return out;
}

/**
 * Fills bytes with leading zeros to a width.
 *
 * @param bytes - The number's bytes.
 * @param width - Bytes wanted, if any.
 * @returns {Uint8Array} The bytes, `width` long when one was given.
 */
function padded(bytes: Uint8Array, width: number | undefined): Uint8Array {
  if (width === undefined) return bytes;
  if (bytes.length > width) {
    throw new DecodeError("integer", `the number takes ${bytes.length} bytes, over width ${width}`);
  }
  const out = new Uint8Array(width);
  out.set(bytes, width - bytes.length);
  return out;
}

/**
 * Reads bytes as one big-endian number.
 *
 * @param bytes - The bytes.
 * @returns {bigint} The number.
 */
function numberOf(bytes: Uint8Array): bigint {
  if (bytes.length === 0) return 0n;
  return BigInt(`0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`);
}

/**
 * Splits a number into `2 ** (level + 1)` limbs, halving it at each power.
 *
 * @param value - The number, under `powers[level]` squared.
 * @param powers - The limb base raised to 1, 2, 4 and so on.
 * @param level - Index of the power to split at, or -1 for one limb.
 * @returns {number[]} The limbs, leading zeros included.
 */
function limbsOf(value: bigint, powers: readonly bigint[], level: number): number[] {
  if (level < 0) return [Number(value)];
  const power = powers[level]!;
  return [
    ...limbsOf(value / power, powers, level - 1),
    ...limbsOf(value % power, powers, level - 1),
  ];
}

/**
 * Writes a number as at least `length` standard digit values.
 *
 * @param value - The number.
 * @param radix - The base.
 * @param length - Fewest digits.
 * @returns {number[]} Digit values, most significant first.
 */
function standardDigits(value: bigint, radix: number, length: number): number[] {
  const width = limbWidth(radix);
  const powers = [BigInt(radix) ** BigInt(width)];
  while (powers.at(-1)! ** 2n <= value) powers.push(powers.at(-1)! ** 2n);
  const digits: number[] = [];
  for (const limb of limbsOf(value, powers, powers.length - 1)) {
    let rest = limb;
    const group: number[] = Array.from({ length: width }, () => 0);
    for (let at = width - 1; at >= 0 && rest > 0; at--) {
      group[at] = rest % radix;
      rest = Math.floor(rest / radix);
    }
    digits.push(...group);
  }
  const first = digits.findIndex((digit) => digit !== 0);
  const kept = digits.slice(first === -1 ? digits.length : first);
  return [...Array.from({ length: Math.max(0, length - kept.length) }, () => 0), ...kept];
}

/**
 * Writes a number in the numeral's symbols, at least `length` digits long.
 *
 * @param value - The number.
 * @param checked - The numeral.
 * @param length - Fewest digits.
 * @returns {string} The number.
 */
function spelled(value: bigint, checked: Readonly<Numeral>, length: number): string {
  return standardDigits(value, checked.radix, length)
    .map((digit) => checked.symbols[digit]!)
    .join("");
}

/**
 * Writes a bijective numeral: the longest repunit that fits, then digits a step up.
 *
 * @param value - The number.
 * @param checked - The numeral.
 * @returns {string} The numeral, empty for zero.
 */
function bijectiveSpelled(value: bigint, checked: Readonly<Numeral>): string {
  if (value === 0n) return "";
  const { radix } = checked;
  const length = standardDigits(value * BigInt(radix - 1) + 1n, radix, 1).length - 1;
  return spelled(value - repunit(radix, length), checked, length);
}

/**
 * A whole number in any base, read as big-endian bytes: `310939249775` is `Hello`. Unlike
 * `decimal` and `octal`, which give each byte a number of its own, the whole text is one number.
 * Leading zero bytes leave no digits behind, so decoding gives them back only through `width`.
 */
export const integer = {
  /**
   * Writes bytes as one number.
   *
   * @param bytes - Bytes, most significant first.
   * @param options - Base or digits, and `bijective`.
   * @returns {string} The number; zero is `0`, or empty when bijective.
   */
  encode(bytes: Uint8Array, options: Readonly<IntegerOptions> = {}): string {
    requireBytes("integer: encode", bytes);
    const checked = numeral(options);
    const value = numberOf(bytes);
    return checked.bijective ? bijectiveSpelled(value, checked) : spelled(value, checked, 1);
  },

  /**
   * Reads one number as bytes, skipping ASCII whitespace.
   *
   * @param text - The number.
   * @param options - Base or digits, `bijective` and `width`.
   * @returns {Uint8Array} Big-endian bytes, no leading zero unless `width` asks.
   */
  decode(text: string, options: Readonly<IntegerDecodeOptions> = {}): Uint8Array {
    requireText("integer: decode", text);
    const checked = numeral(options);
    const { width } = options;
    if (width !== undefined && (!Number.isInteger(width) || width < 1)) {
      throw new InvalidOptionError("width", width, "must be a positive integer");
    }
    const digits = digitsOf(text, checked);
    let value = valueOf(digits, checked.radix);
    if (checked.bijective) value += repunit(checked.radix, digits.length);
    return padded(bytesOf(value), width);
  },
} as const;
