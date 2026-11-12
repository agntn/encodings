import { requireBytes, requireText } from "./bytes.ts";
import { DecodeError, EncodingError, InvalidOptionError, named } from "./errors.ts";
import type { BitOrder } from "./binary.ts";

/** The code tables: ITA2, Baudot's ITA1 and the American US-TTY. */
export const ITA2_ALPHABETS = ["ita2", "ita1", "us-tty"] as const;

/** One of the code tables. */
export type Ita2Alphabet = (typeof ITA2_ALPHABETS)[number];

/** How five-bit teleprinter codes are spelled. */
export interface Ita2Options {
  /** Code table. Default: `ita2`. */
  alphabet?: Ita2Alphabet;
  /** Bits only: `msb` writes element 5 first, `lsb` element 1. Default: `msb`. */
  order?: BitOrder;
  /** Codes as decimal numbers from 0 to 31 in place of bits. Default: false. */
  numbers?: boolean;
}

/** Options for writing teleprinter codes. */
export interface Ita2EncodeOptions extends Ita2Options {
  /** Put a space between codes written as bits. Default: true. */
  separate?: boolean;
}

/** Which half of the table a code reads from. */
type Case = "letters" | "figures";

/** A shift code, which switches the case instead of printing. */
interface Shift {
  readonly shift: Case;
}

/** What one code means in one case: a character, a shift, or nothing. */
type Cell = string | Shift | undefined;

/** One code table, the letters case and the figures case, each by code from 0 to 31. */
interface Table {
  readonly letters: readonly Cell[];
  readonly figures: readonly Cell[];
}

const LTRS: Shift = { shift: "letters" };
const FIGS: Shift = { shift: "figures" };
const NUL = "\0";
const BEL = "\u0007";
const DEL = "\u007F";

/**
 * Builds one case of a table, a character per code and `cells` for the rest.
 *
 * @param characters - One character per code, placeholders where `cells` has one.
 * @param cells - The cells that replace them, by code.
 * @returns {Cell[]} The case by code.
 */
function row(characters: string, cells: Readonly<Record<number, Cell>>): Cell[] {
  return Array.from(characters, (character, code) =>
    Object.hasOwn(cells, code) ? cells[code] : character,
  );
}

/** ITA2 letters by code, element 1 the lowest bit. */
const ITA2_LETTERS = row("~E~A SIU~DRJNFCKTZLWHYPQOBG~MXV~", {
  0: NUL,
  2: "\n",
  8: "\r",
  27: FIGS,
  31: LTRS,
});

/** ITA2 figures. D is "who are you?", J the bell, F, G and H unassigned. */
const ITA2_FIGURES = row("~3~- '87~~4~,~:(5+)2~6019?~~./=~", {
  0: NUL,
  2: "\n",
  8: "\r",
  9: "\u0005",
  11: BEL,
  13: undefined,
  20: undefined,
  26: undefined,
  27: FIGS,
  31: LTRS,
});

/** US-TTY figures, which move the bell to S and fill D, F, G, H, V and Z. */
const US_TTY_FIGURES = row("~3~- ~87~$4',!:(5\")2#6019?&~./;~", {
  0: NUL,
  2: "\n",
  5: BEL,
  8: "\r",
  27: FIGS,
  31: LTRS,
});

/** ITA1 as CCITT-1 of 1929, where each shift is a space in the other case. */
const ITA1: Table = {
  letters: row("~AE~YUIO~JGHBCFD~~XZSTWV~KMLRQNP", {
    0: undefined,
    3: "\r",
    8: FIGS,
    16: " ",
    17: "\n",
    24: DEL,
  }),
  figures: row("~12~34~5~67+89~0~~,:.~?'~()=-/~%", {
    0: undefined,
    3: "\r",
    6: undefined,
    8: " ",
    14: undefined,
    16: LTRS,
    17: "\n",
    21: undefined,
    24: DEL,
    30: undefined,
  }),
};

const TABLES: Readonly<Record<Ita2Alphabet, Table>> = {
  ita2: { letters: ITA2_LETTERS, figures: ITA2_FIGURES },
  ita1: ITA1,
  "us-tty": { letters: ITA2_LETTERS, figures: US_TTY_FIGURES },
};

/** Checked options. */
interface Layout {
  name: Ita2Alphabet;
  table: Table;
  lsb: boolean;
  numbers: boolean;
}

/** One code read from the text, with where it starts there. */
interface Code {
  readonly value: number;
  readonly index: number;
}

const utf8Decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/**
 * Checks the options and fills in their defaults.
 *
 * @param options - Options from the caller.
 * @returns {Layout} The table, the bit order and the form of the codes.
 */
function layout(options: Readonly<Ita2Options>): Layout {
  const { alphabet = "ita2", order = "msb", numbers = false } = options;
  if (!(ITA2_ALPHABETS as readonly string[]).includes(alphabet)) {
    throw new InvalidOptionError("alphabet", alphabet, `use one of ${ITA2_ALPHABETS.join(", ")}`);
  }
  if (order !== "msb" && order !== "lsb") {
    throw new InvalidOptionError("order", order, "use one of msb, lsb");
  }
  if (typeof numbers !== "boolean") {
    throw new InvalidOptionError("numbers", numbers, "must be a boolean");
  }
  return { name: alphabet, table: TABLES[alphabet], lsb: order === "lsb", numbers };
}

/**
 * Finds the code a character has in one case.
 *
 * @param cells - The case.
 * @param character - One character.
 * @returns {number} Its code, or -1.
 */
function codeIn(cells: readonly Cell[], character: string): number {
  return cells.indexOf(character);
}

/**
 * Finds the shift code into a case, as the other case writes it.
 *
 * @param cells - The case the shift is sent from.
 * @param into - The case it switches to.
 * @returns {number} The code.
 */
function shiftInto(cells: readonly Cell[], into: Case): number {
  return cells.findIndex((cell) => typeof cell === "object" && cell.shift === into);
}

/**
 * Explains a character no case of the table writes.
 *
 * @param character - The character.
 * @param index - Its index in the text.
 * @param name - The table.
 * @returns {EncodingError} The error.
 */
function unwritable(character: string, index: number, name: Ita2Alphabet): EncodingError {
  const hint = /\p{Ll}/u.test(character) ? "; teleprinters print capitals only" : "";
  return new EncodingError(
    `ita2: ${named(character)} at index ${index} has no code in ${name}${hint}`,
  );
}

/**
 * Turns text into codes, putting a shift before each character from the other case.
 *
 * @param text - The text.
 * @param checked - The table.
 * @returns {number[]} The codes.
 */
function codesOf(text: string, checked: Readonly<Layout>): number[] {
  const { table, name } = checked;
  const out: number[] = [];
  let current: Case = "letters";
  let index = 0;
  for (const character of text) {
    const other: Case = current === "letters" ? "figures" : "letters";
    const here = codeIn(table[current], character);
    if (here >= 0) out.push(here);
    else {
      const there = codeIn(table[other], character);
      if (there < 0) throw unwritable(character, index, name);
      out.push(shiftInto(table[current], other), there);
      current = other;
    }
    index += character.length;
  }
  return out;
}

/**
 * Spells one code as five bits.
 *
 * @param code - From 0 to 31.
 * @param lsb - Whether element 1, the lowest bit, comes first.
 * @returns {string} Five `0` and `1` digits.
 */
function bitsOf(code: number, lsb: boolean): string {
  const bits = code.toString(2).padStart(5, "0");
  return lsb ? Array.from(bits).reverse().join("") : bits;
}

/**
 * Reads codes written as groups of five bits, skipping ASCII whitespace.
 *
 * @param text - The bits.
 * @param lsb - Whether element 1 comes first.
 * @returns {Code[]} The codes, each at the index of its first bit.
 */
function readBits(text: string, lsb: boolean): Code[] {
  const codes: Code[] = [];
  let value = 0;
  let count = 0;
  let start = 0;
  for (let index = 0; index < text.length; index++) {
    const bit = bitAt(text, index);
    if (bit < 0) continue;
    if (count === 0) start = index;
    value = lsb ? value | (bit << count) : (value << 1) | bit;
    count++;
    if (count === 5) {
      codes.push({ value, index: start });
      value = 0;
      count = 0;
    }
  }
  if (count !== 0) {
    throw new DecodeError("ita2", `${codes.length * 5 + count} bits are not whole groups of 5`);
  }
  return codes;
}

/**
 * Reads one character of bit text.
 *
 * @param text - The bits.
 * @param index - Where to read.
 * @returns {number} The bit, or -1 for ASCII whitespace.
 */
function bitAt(text: string, index: number): number {
  const character = text[index];
  if (character === "0" || character === "1") return Number(character);
  if (/^[\t\n\f\r ]$/u.test(character!)) return -1;
  const stray = String.fromCodePoint(text.codePointAt(index)!);
  throw new DecodeError("ita2", `${named(stray)} is not a 0 or a 1`, index);
}

/**
 * Reads codes written as decimal numbers, split by whitespace or commas.
 *
 * @param text - The numbers.
 * @returns {Code[]} The codes, each at the index of its number.
 */
function readNumbers(text: string): Code[] {
  const codes: Code[] = [];
  for (const match of text.matchAll(/[^\t\n\f\r ,]+/gu)) {
    const [token] = match;
    if (!/^\d+$/u.test(token)) {
      const at = token.search(/\D/u);
      const stray = String.fromCodePoint(token.codePointAt(at)!);
      throw new DecodeError("ita2", `${named(stray)} is not a digit`, match.index + at);
    }
    const value = Number(token);
    if (value > 31) {
      throw new DecodeError("ita2", `the number at index ${match.index} is over 31`, match.index);
    }
    codes.push({ value, index: match.index });
  }
  return codes;
}

/**
 * Prints codes, following the shifts. Decoding starts among letters.
 *
 * @param codes - The codes in order.
 * @param checked - The table.
 * @returns {Uint8Array} The text, which every table writes in ASCII.
 */
function print(codes: readonly Code[], checked: Readonly<Layout>): Uint8Array {
  const { table, name } = checked;
  let current: Case = "letters";
  const out = new Uint8Array(codes.length);
  let length = 0;
  for (const { value, index } of codes) {
    const cell: Cell = table[current][value];
    if (cell === undefined) {
      throw new DecodeError(
        "ita2",
        `code ${value} at index ${index} means nothing among ${current} in ${name}`,
        index,
      );
    }
    if (typeof cell === "string") out[length++] = cell.codePointAt(0)!;
    else current = cell.shift;
  }
  return out.slice(0, length);
}

/** Baudot-Murray teleprinter code (ITU-T S.1), five bits a character, shifts handled. */
export const ita2 = {
  /**
   * Writes text as teleprinter codes.
   *
   * @param bytes - UTF-8 text in capitals, figures and the controls the table has.
   * @param options - Table, bit order, numbers and spacing.
   * @returns {string} One group of five bits, or one number, per code.
   */
  encode(bytes: Uint8Array, options: Readonly<Ita2EncodeOptions> = {}): string {
    requireBytes("ita2: encode", bytes);
    const checked = layout(options);
    let text: string;
    try {
      text = utf8Decoder.decode(bytes);
    } catch {
      throw new EncodingError("ita2: encode takes UTF-8 text, and these bytes are not");
    }
    const codes = codesOf(text, checked);
    if (checked.numbers) return codes.join(" ");
    const groups = codes.map((code) => bitsOf(code, checked.lsb));
    return groups.join(options.separate === false ? "" : " ");
  },

  /**
   * Reads teleprinter codes as text.
   *
   * @param text - Groups of five bits, optionally spaced, or numbers from 0 to 31.
   * @param options - Table, bit order and numbers.
   * @returns {Uint8Array} The text as UTF-8.
   */
  decode(text: string, options: Readonly<Ita2Options> = {}): Uint8Array {
    requireText("ita2: decode", text);
    const checked = layout(options);
    const codes = checked.numbers ? readNumbers(text) : readBits(text, checked.lsb);
    return print(codes, checked);
  },
} as const;
