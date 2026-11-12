import { requireBytes, requireText } from "./bytes.ts";
import {
  DecodeError,
  EncodingError,
  InvalidOptionError,
  MissingOptionError,
  named,
  shown,
} from "./errors.ts";

/** Prefix codes built from a rule instead of a codebook. */
export const PREFIX_CODES = ["truncated", "unary", "gamma"] as const;

/** One of the built-in prefix codes. */
export type PrefixCodeName = (typeof PREFIX_CODES)[number];

/** Codewords by symbol: each symbol one character, each codeword a run of `0` and `1`. */
export type Codebook = Readonly<Record<string, string>>;

/** Which prefix code reads and writes the bits: a codebook, or one of `PREFIX_CODES`. */
export interface PrefixOptions {
  /** Codewords by symbol, as an object or as text like `A=0 B=10 C=11`; JSON for odd symbols. */
  codebook?: string | Codebook;
  /** `truncated` binary for `n` symbols, `unary` or Elias `gamma`; their symbols are numbers. */
  code?: PrefixCodeName;
  /** Truncated binary only: how many symbols, from 2 up. */
  n?: number;
}

/** Options for writing a prefix code. */
export interface PrefixEncodeOptions extends PrefixOptions {
  /** Put a space between codewords. Default: false. */
  separate?: boolean;
}

/** Text a bit stream decoded to, with what the code and the bits left over say. */
export interface PrefixDecoded {
  /** The symbols as UTF-8, numbers split by spaces. */
  bytes: Uint8Array;
  /** Kraft sum of the codeword lengths, such as `1` for a complete code or `3/4`. */
  kraft: string;
  /** Bits at the end that start a codeword without finishing it, empty when none. */
  leftover: string;
}

/** One symbol read off the bits, or nothing when they run out inside a codeword. */
type Step = { readonly symbol: string; readonly next: number } | undefined;

/** A checked prefix code. */
interface Scheme {
  /** Whether the symbols are numbers, written and read split by spaces. */
  readonly numbers: boolean;
  /** Kraft sum. */
  readonly kraft: string;
  /** What the code writes, for a message about what it can't. */
  readonly range: string;
  /** Codeword of one symbol, or nothing when the code has none for it. */
  readonly write: (symbol: string) => string | undefined;
  /** Reads one codeword from the bits at `at`. */
  readonly read: (bits: string, at: number) => Step;
}

/** A node of the codebook's binary tree, as `treeOf` grows it. */
interface Node {
  symbol?: string;
  zero?: Node;
  one?: Node;
}

/** The same node once the tree is built. */
interface Branch {
  readonly symbol?: string;
  readonly zero?: Branch;
  readonly one?: Branch;
}

/** Longest codeword, in bits: every input symbol becomes one, so this caps the output. */
const MAX_CODEWORD = 256;

/** Largest unary number, whose n + 1 bits stay within `MAX_CODEWORD`. */
const MAX_UNARY = MAX_CODEWORD - 1;

/** Longest value an error message repeats; a longer one shows as its length. */
const MAX_SHOWN = 40;

/** Most symbols of truncated binary, so every codeword stays a safe integer. */
const MAX_TRUNCATED = 2 ** 32;

/** Most codewords `codebook()` lists for truncated binary. */
const MAX_LISTED = 65_536;

/**
 * A codebook value as a message repeats it: whole when short, as a length when not.
 *
 * @param value - The value.
 * @returns {unknown} The value, or its length in characters.
 */
function brief(value: unknown): unknown {
  return typeof value === "string" && value.length > MAX_SHOWN
    ? `${value.length} characters`
    : value;
}

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/**
 * Reads a codebook written as `A=0 B:10` pairs, or as a JSON object.
 *
 * @param text - The codebook.
 * @returns {[string, string][]} Symbol and codeword pairs, in order.
 */
function pairsOf(text: string): [string, string][] {
  if (text.trimStart().startsWith("{")) return Object.entries(parsedJson(text));
  return Array.from(text.matchAll(/[^\t\n\f\r ,]+/gu), ([entry]) => {
    const pair = /^(.*)[=:]([^=:]*)$/su.exec(entry);
    if (!pair) {
      throw new InvalidOptionError("codebook", brief(entry), "write each entry as symbol=bits");
    }
    return [pair[1]!, pair[2]!];
  });
}

/**
 * Parses a codebook written as JSON.
 *
 * @param text - JSON text.
 * @returns {Codebook} The object it holds.
 */
function parsedJson(text: string): Codebook {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new InvalidOptionError("codebook", brief(text), "is not valid JSON");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidOptionError("codebook", brief(text), "must be a JSON object of symbol: bits");
  }
  return value as Codebook;
}

/**
 * Takes the codebook in any form the options allow and checks each entry on its own.
 *
 * @param codebook - The codebook as given.
 * @returns {[string, string][]} Checked symbol and codeword pairs.
 */
function entriesOf(codebook: unknown): [string, string][] {
  let pairs: [string, unknown][];
  if (typeof codebook === "string") pairs = pairsOf(codebook);
  else if (typeof codebook === "object" && codebook !== null && !Array.isArray(codebook)) {
    pairs = Object.entries(codebook);
  } else throw new InvalidOptionError("codebook", codebook, "must be text or an object");
  if (pairs.length === 0) {
    throw new InvalidOptionError("codebook", brief(codebook), "has no codewords");
  }
  return pairs.map(([symbol, codeword]) => checkEntry(symbol, codeword));
}

/**
 * Checks one entry: a symbol of one character and a codeword of `0` and `1`.
 *
 * @param symbol - The symbol.
 * @param codeword - Its codeword.
 * @returns {[string, string]} The entry.
 */
function checkEntry(symbol: string, codeword: unknown): [string, string] {
  if (Array.from(symbol).length !== 1) {
    throw new InvalidOptionError("codebook", brief(symbol), "takes one character per symbol");
  }
  if (typeof codeword !== "string" || !/^[01]+$/u.test(codeword)) {
    throw new InvalidOptionError(
      "codebook",
      brief(codeword),
      `the codeword of ${named(symbol)} must be a run of 0 and 1`,
    );
  }
  if (codeword.length > MAX_CODEWORD) {
    throw new InvalidOptionError(
      "codebook",
      brief(codeword),
      `the codeword of ${named(symbol)} is over ${MAX_CODEWORD} bits`,
    );
  }
  return [symbol, codeword];
}

/**
 * Refuses a codeword that starts another. Once sorted, checking neighbours is enough.
 *
 * @param entries - Checked pairs.
 */
function checkPrefixFree(entries: readonly (readonly [string, string])[]): void {
  const sorted = entries.toSorted(([, left], [, right]) => (left < right ? -1 : 1));
  for (let index = 1; index < sorted.length; index++) {
    const [first, shorter] = sorted[index - 1]!;
    const [second, longer] = sorted[index]!;
    if (longer === shorter) {
      throw new InvalidOptionError(
        "codebook",
        `${first}=${shorter}`,
        `gives ${named(first)} and ${named(second)} the same codeword ${shorter}`,
      );
    }
    if (longer.startsWith(shorter)) {
      throw new InvalidOptionError(
        "codebook",
        `${first}=${shorter}`,
        `is not prefix-free: ${named(first)} = ${shorter} is a prefix of ${named(second)} = ${longer}`,
      );
    }
  }
}

/**
 * Writes an exact fraction in lowest terms.
 *
 * @param numerator - The top.
 * @param exponent - The bottom is 2 to this power.
 * @returns {string} Such as `1`, `3/4` or `5/4`.
 */
function fraction(numerator: bigint, exponent: number): string {
  let top = numerator;
  let power = exponent;
  while (power > 0 && top % 2n === 0n) {
    top /= 2n;
    power--;
  }
  return power === 0 ? top.toString() : `${top}/${1n << BigInt(power)}`;
}

/**
 * Sums 2 to the minus length of every codeword, exactly.
 *
 * @param codewords - The codewords.
 * @returns {string} The Kraft sum as a fraction.
 */
function kraftOf(codewords: readonly string[]): string {
  const longest = codewords.reduce((most, codeword) => Math.max(most, codeword.length), 0);
  const total = codewords.reduce(
    (sum, codeword) => sum + (1n << BigInt(longest - codeword.length)),
    0n,
  );
  return fraction(total, longest);
}

/**
 * Builds the binary tree a decoder walks, one leaf per symbol.
 *
 * @param entries - Prefix-free pairs.
 * @returns {Node} The root.
 */
function treeOf(entries: readonly (readonly [string, string])[]): Node {
  const root: Node = {};
  for (const [symbol, codeword] of entries) {
    let node = root;
    for (const bit of codeword) {
      const branch = bit === "0" ? "zero" : "one";
      node = node[branch] ??= {};
    }
    node.symbol = symbol;
  }
  return root;
}

/**
 * Skips ASCII whitespace from `at` to the next bit, refusing anything else.
 *
 * @param bits - The bit text.
 * @param at - Where to start.
 * @returns {number} Index of the next bit, or the text's length.
 */
function nextBit(bits: string, at: number): number {
  let index = at;
  while (index < bits.length) {
    const character = bits[index]!;
    if (character === "0" || character === "1") return index;
    if (!/^[\t\n\f\r ]$/u.test(character)) {
      const stray = String.fromCodePoint(bits.codePointAt(index)!);
      throw new DecodeError("prefix", `${named(stray)} is not a 0 or a 1`, index);
    }
    index++;
  }
  return index;
}

/**
 * Explains bits that lead off the codebook's tree: an incomplete code has no codeword there.
 *
 * @param bits - The bit text.
 * @param start - Index of the codeword's first bit.
 * @param end - Index just past the bit with no branch.
 * @returns {DecodeError} The error.
 */
function offTree(bits: string, start: number, end: number): DecodeError {
  const read = bits.slice(start, end).replaceAll(/[\t\n\f\r ]/gu, "");
  return new DecodeError("prefix", `bits ${read} at index ${start} start no codeword`, start);
}

/**
 * Walks the tree from `at` to a leaf.
 *
 * @param root - The tree.
 * @param bits - The bit text.
 * @param at - Index of the codeword's first bit.
 * @returns {Step} The symbol and where the next codeword starts, or nothing when bits run out.
 */
function walk(root: Branch, bits: string, at: number): Step {
  let node = root;
  let index = at;
  while (node.symbol === undefined) {
    index = nextBit(bits, index);
    if (index === bits.length) return undefined;
    const child = bits[index] === "0" ? node.zero : node.one;
    if (child === undefined) throw offTree(bits, at, index + 1);
    node = child;
    index++;
  }
  return { symbol: node.symbol, next: index };
}

/**
 * Builds the scheme of a codebook.
 *
 * @param codebook - The codebook as given.
 * @returns {Scheme} The scheme.
 */
function codebookScheme(codebook: unknown): Scheme {
  const entries = entriesOf(codebook);
  const symbols = new Map<string, string>();
  for (const [symbol, codeword] of entries) {
    if (symbols.has(symbol)) {
      throw new InvalidOptionError("codebook", symbol, `gives ${named(symbol)} two codewords`);
    }
    symbols.set(symbol, codeword);
  }
  checkPrefixFree(entries);
  const root = treeOf(entries);
  return {
    numbers: false,
    range: "add it to the codebook",
    kraft: kraftOf(entries.map(([, codeword]) => codeword)),
    write: (symbol) => symbols.get(symbol),
    read: (bits, at) => walk(root, bits, at),
  };
}

/**
 * Reads `count` bits from `at` as an unsigned number.
 *
 * @param bits - The bit text.
 * @param at - Index of the first bit.
 * @param count - How many bits.
 * @returns {{ value: bigint; next: number } | undefined} The number and the index after it.
 */
function readNumber(
  bits: string,
  at: number,
  count: number,
): { value: bigint; next: number } | undefined {
  let value = 0n;
  let index = at;
  for (let read = 0; read < count; read++) {
    index = nextBit(bits, index);
    if (index === bits.length) return undefined;
    value = (value << 1n) | (bits[index] === "1" ? 1n : 0n);
    index++;
  }
  return { value, next: index };
}

/**
 * Counts the bits equal to `bit` from `at` until the first other bit, which it reads too.
 *
 * @param bits - The bit text.
 * @param at - Index of the first bit.
 * @param bit - The repeated bit.
 * @returns {{ count: number; next: number } | undefined} The run and what follows, if it ends.
 */
function readRun(
  bits: string,
  at: number,
  bit: string,
): { count: number; next: number } | undefined {
  let count = 0;
  let index = nextBit(bits, at);
  while (index < bits.length && bits[index] === bit) {
    count++;
    index = nextBit(bits, index + 1);
  }
  return index === bits.length ? undefined : { count, next: index + 1 };
}

/**
 * Reads a symbol of a numeric code as a whole number.
 *
 * @param symbol - Decimal digits.
 * @returns {bigint | undefined} The number, or nothing for anything but digits.
 */
function wholeNumber(symbol: string): bigint | undefined {
  return /^\d+$/u.test(symbol) ? BigInt(symbol) : undefined;
}

/**
 * Builds truncated binary: the first 2^(k+1) - n symbols in k bits, the rest in k + 1.
 *
 * @param n - How many symbols.
 * @returns {Scheme} The scheme.
 */
function truncatedScheme(n: unknown): Scheme {
  if (n === undefined) {
    throw new MissingOptionError("n", "truncated binary needs the number of symbols");
  }
  if (typeof n !== "number" || !Number.isInteger(n) || n < 2 || n > MAX_TRUNCATED) {
    throw new InvalidOptionError("n", n, `must be a whole number from 2 to ${MAX_TRUNCATED}`);
  }
  const size = BigInt(n);
  const k = n.toString(2).length - 1;
  const short = (1n << BigInt(k + 1)) - size;
  return {
    numbers: true,
    range: `truncated binary for ${n} takes 0 to ${n - 1}`,
    kraft: "1",
    write(symbol) {
      const value = wholeNumber(symbol);
      if (value === undefined || value >= size) return undefined;
      if (value < short) return value.toString(2).padStart(k, "0");
      return (value + short).toString(2).padStart(k + 1, "0");
    },
    read(bits, at) {
      const head = readNumber(bits, at, k);
      if (head === undefined) return undefined;
      if (head.value < short) return { symbol: head.value.toString(), next: head.next };
      const tail = readNumber(bits, head.next, 1);
      if (tail === undefined) return undefined;
      return { symbol: (((head.value << 1n) | tail.value) - short).toString(), next: tail.next };
    },
  };
}

/** Unary: n ones and a closing zero, for every n from 0. */
const UNARY: Scheme = {
  numbers: true,
  range: `unary takes 0 to ${MAX_UNARY}`,
  kraft: "1",
  write(symbol) {
    const value = wholeNumber(symbol);
    if (value === undefined || value > BigInt(MAX_UNARY)) return undefined;
    return `${"1".repeat(Number(value))}0`;
  },
  read(bits, at) {
    const run = readRun(bits, at, "1");
    if (run && run.count > MAX_UNARY) {
      throw new DecodeError("prefix", `the unary run at index ${at} is over ${MAX_UNARY}`, at);
    }
    return run && { symbol: String(run.count), next: run.next };
  },
};

/** Elias gamma: as many zeros as n has bits after its first, then n in binary, for n from 1. */
const GAMMA: Scheme = {
  numbers: true,
  range: "Elias gamma starts at 1",
  kraft: "1",
  write(symbol) {
    const value = wholeNumber(symbol);
    if (value === undefined || value === 0n) return undefined;
    const binary = value.toString(2);
    return `${"0".repeat(binary.length - 1)}${binary}`;
  },
  read(bits, at) {
    const run = readRun(bits, at, "0");
    if (run === undefined) return undefined;
    const rest = readNumber(bits, run.next, run.count);
    if (rest === undefined) return undefined;
    const value = (1n << BigInt(run.count)) | rest.value;
    return { symbol: value.toString(), next: rest.next };
  },
};

/**
 * Checks the options and builds the code they name.
 *
 * @param options - Options from the caller.
 * @returns {Scheme} The scheme.
 */
function schemeOf(options: Readonly<PrefixOptions>): Scheme {
  const { codebook, code, n } = options;
  if (codebook !== undefined && code !== undefined) {
    throw new InvalidOptionError("code", code, "give a codebook or a code, not both");
  }
  if (n !== undefined && code !== "truncated") {
    throw new InvalidOptionError("n", n, "only the truncated code takes it");
  }
  if (codebook !== undefined) return codebookScheme(codebook);
  return builtinScheme(code, n);
}

/**
 * Builds one of `PREFIX_CODES`.
 *
 * @param code - Its name, as given.
 * @param n - Truncated binary's number of symbols, as given.
 * @returns {Scheme} The scheme.
 */
function builtinScheme(code: unknown, n: unknown): Scheme {
  if (code === undefined) {
    throw new MissingOptionError(
      "codebook",
      `give a codebook or a code: ${PREFIX_CODES.join(", ")}`,
    );
  }
  if (code === "truncated") return truncatedScheme(n);
  if (code === "unary") return UNARY;
  if (code === "gamma") return GAMMA;
  throw new InvalidOptionError("code", code, `use one of ${PREFIX_CODES.join(", ")}`);
}

/**
 * Explains a symbol the code has no codeword for.
 *
 * @param symbol - The symbol.
 * @param index - Its index in the text.
 * @param scheme - The code.
 * @returns {EncodingError} The error.
 */
function unwritable(symbol: string, index: number, scheme: Readonly<Scheme>): EncodingError {
  const what = scheme.numbers ? `the number ${shown(symbol)}` : named(symbol);
  return new EncodingError(`prefix: ${what} at index ${index} has no codeword; ${scheme.range}`);
}

/**
 * Splits text into symbols with their index: characters for a codebook, numbers otherwise.
 *
 * @param text - The text.
 * @param scheme - The code.
 * @returns {{ symbol: string; index: number }[]} The symbols.
 */
function symbolsOf(text: string, scheme: Readonly<Scheme>): { symbol: string; index: number }[] {
  if (!scheme.numbers) {
    const out: { symbol: string; index: number }[] = [];
    let index = 0;
    for (const symbol of text) {
      out.push({ symbol, index });
      index += symbol.length;
    }
    return out;
  }
  return Array.from(text.matchAll(/[^\t\n\f\r ,]+/gu), (match) => {
    const at = match[0].search(/\D/u);
    if (at >= 0) {
      const stray = String.fromCodePoint(match[0].codePointAt(at)!);
      throw new EncodingError(
        `prefix: ${named(stray)} at index ${match.index + at} is not a digit`,
      );
    }
    return { symbol: match[0], index: match.index };
  });
}

/**
 * Reads the text the bytes hold.
 *
 * @param bytes - UTF-8 bytes.
 * @returns {string} The text.
 */
function textOf(bytes: Uint8Array): string {
  try {
    return utf8Decoder.decode(bytes);
  } catch {
    throw new EncodingError("prefix: encode takes UTF-8 text, and these bytes are not");
  }
}

/**
 * Builds the code the options name, for the functions that only look at it.
 *
 * @param options - A codebook, or a code and its `n`.
 * @returns {Scheme} The scheme.
 */
function described(options: Readonly<PrefixOptions>): Scheme {
  if (typeof options !== "object" || options === null) {
    throw new InvalidOptionError("options", options, "must be an object");
  }
  return schemeOf(options);
}

/** Prefix codes: a codebook of your own, truncated binary, unary and Elias gamma. */
export const prefix = {
  /**
   * Writes text as the codewords of its symbols.
   *
   * @param bytes - UTF-8 text: characters of the codebook, or numbers for a built-in code.
   * @param options - The code and spacing.
   * @returns {string} The bits.
   */
  encode(bytes: Uint8Array, options: Readonly<PrefixEncodeOptions> = {}): string {
    requireBytes("prefix: encode", bytes);
    const scheme = described(options);
    const codewords = symbolsOf(textOf(bytes), scheme).map(({ symbol, index }) => {
      const codeword = scheme.write(symbol);
      if (codeword === undefined) throw unwritable(symbol, index, scheme);
      return codeword;
    });
    return codewords.join(options.separate === true ? " " : "");
  },

  /**
   * Reads bits as symbols; bits that only start a codeword come back as `leftover`.
   *
   * @param text - Bits, whitespace anywhere.
   * @param options - The code.
   * @returns {PrefixDecoded} The text, the Kraft sum and the leftover bits.
   */
  decode(text: string, options: Readonly<PrefixOptions> = {}): PrefixDecoded {
    requireText("prefix: decode", text);
    const scheme = described(options);
    const symbols: string[] = [];
    let at = nextBit(text, 0);
    while (at < text.length) {
      const step = scheme.read(text, at);
      if (step === undefined) break;
      symbols.push(step.symbol);
      at = nextBit(text, step.next);
    }
    const leftover = text.slice(at).replaceAll(/[\t\n\f\r ]/gu, "");
    const joined = symbols.join(scheme.numbers ? " " : "");
    return { bytes: utf8Encoder.encode(joined), kraft: scheme.kraft, leftover };
  },

  /**
   * Lists every codeword of a finite code: a codebook, or truncated binary for `n`.
   *
   * @param options - The code.
   * @returns {Record<string, string>} Codewords by symbol.
   */
  codebook(options: Readonly<PrefixOptions>): Record<string, string> {
    const scheme = described(options);
    if (options.codebook !== undefined) return Object.fromEntries(entriesOf(options.codebook));
    if (options.code !== "truncated") {
      throw new InvalidOptionError("code", options.code, "has a codeword for every number, no end");
    }
    const size = Number(options.n);
    if (size > MAX_LISTED) {
      throw new InvalidOptionError("n", size, `lists up to ${MAX_LISTED} codewords`);
    }
    return Object.fromEntries(
      Array.from({ length: size }, (_, value) => [String(value), scheme.write(String(value))!]),
    );
  },

  /**
   * Sums 2 to the minus length of every codeword: 1 for a complete code, less with free leaves.
   *
   * @param options - The code.
   * @returns {string} The sum as an exact fraction, such as `1` or `7/8`.
   */
  kraft(options: Readonly<PrefixOptions>): string {
    return described(options).kraft;
  },
} as const;
