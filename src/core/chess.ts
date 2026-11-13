import { requireBytes, requireText } from "./bytes.ts";
import { DecodeError, EncodingError, InvalidOptionError, named } from "./errors.ts";
import { NUMBER } from "./numbers.ts";

/** Which square is 0 and which way the count runs. */
export const CHESS_LAYOUTS = ["a1", "a8", "file"] as const;

/** One way of numbering the squares. */
export type ChessLayout = (typeof CHESS_LAYOUTS)[number];

/** How squares are numbered and written. */
export interface SquareOptions {
  /** Which square is 0: `a1` as engines count, `a8` as FEN reads, `file`. Default: `a1`. */
  layout?: ChessLayout;
  /** Squares as (file, rank) pairs counted from 0, such as `(4, 3)` for e4. Default: false. */
  pairs?: boolean;
  /** The squares as one set: eight bytes big-endian, bit i for square i. Default: false. */
  bitboard?: boolean;
}

/** Chess squares as bytes, one square per byte from 0 to 63. */
export interface SquareCodec {
  /**
   * Writes square indices as squares.
   *
   * @param bytes - One square index per byte, 0 to 63, or a bitboard of eight bytes.
   * @param options - Layout, pairs, and whether the bytes are a bitboard.
   * @returns {string} The squares, spaced.
   */
  encode(bytes: Uint8Array, options?: Readonly<SquareOptions>): string;
  /**
   * Reads squares as their indices.
   *
   * @param text - Squares split by whitespace or commas.
   * @param options - Layout, pairs, and whether to pack the squares into a bitboard.
   * @returns {Uint8Array} One index per square, or the eight bytes of a bitboard.
   */
  decode(text: string, options?: Readonly<SquareOptions>): Uint8Array;
}

/** A square by its file, a = 0, and its rank, 1 = 0. */
interface Square {
  readonly file: number;
  readonly rank: number;
}

/** One square's bit in a bitboard: the byte it sits in and its mask there. */
interface BitboardBit {
  readonly byte: number;
  readonly mask: number;
}

/** A square read from the text and the index it starts at. */
interface Placed {
  readonly square: Square;
  readonly at: number;
}

/** A value read from the text and the index just past it. */
interface Read<T> {
  readonly value: T;
  readonly next: number;
}

const NAME = "square";

export const FILES = "abcdefgh";

/** Bytes in a bitboard, one per rank of eight squares. */
export const BITBOARD_BYTES = 8;

/** What may sit inside a pair, around its digits and marks. */
const SPACE = "\t\n\f\r ";

/** What may sit between squares. */
const SEPARATOR = "\t\n\f\r ,";

/**
 * Checks the options, which callers without types can pass as anything.
 *
 * @param options - Options from the caller.
 * @returns {Required<SquareOptions>} The options with their defaults.
 */
function squareOptions(options: Readonly<SquareOptions>): Required<SquareOptions> {
  const { layout = "a1", pairs = false, bitboard = false } = options;
  if (!(CHESS_LAYOUTS as readonly unknown[]).includes(layout)) {
    throw new InvalidOptionError("layout", layout, `use one of ${CHESS_LAYOUTS.join(", ")}`);
  }
  if (typeof pairs !== "boolean") throw new InvalidOptionError("pairs", pairs, "must be a boolean");
  if (typeof bitboard !== "boolean") {
    throw new InvalidOptionError("bitboard", bitboard, "must be a boolean");
  }
  return { layout, pairs, bitboard };
}

/**
 * Numbers a square.
 *
 * @param square - The square.
 * @param layout - How squares are numbered.
 * @returns {number} Its index, 0 to 63.
 */
export function indexOf(square: Square, layout: ChessLayout): number {
  if (layout === "a8") return (7 - square.rank) * 8 + square.file;
  if (layout === "file") return square.file * 8 + square.rank;
  return square.rank * 8 + square.file;
}

/**
 * Finds the square an index stands for.
 *
 * @param index - 0 to 63.
 * @param layout - How squares are numbered.
 * @returns {Square} The square.
 */
export function squareOf(index: number, layout: ChessLayout): Square {
  const high = index >> 3;
  const low = index & 7;
  if (layout === "a8") return { file: low, rank: 7 - high };
  if (layout === "file") return { file: high, rank: low };
  return { file: low, rank: high };
}

/**
 * Names a square, such as `e4`.
 *
 * @param one - The square.
 * @returns {string} Its name.
 */
export function nameOfSquare(one: Square): string {
  return `${FILES[one.file]}${one.rank + 1}`;
}

/**
 * Where a square sits in a bitboard: big-endian, so square 0 is the low bit of the last byte.
 *
 * @param index - The square, 0 to 63.
 * @returns {BitboardBit} Its byte and the mask of its bit.
 */
export function bitboardBit(index: number): BitboardBit {
  return { byte: BITBOARD_BYTES - 1 - (index >> 3), mask: 1 << (index & 7) };
}

/**
 * Reads one square name such as `e4`, capital files too.
 *
 * @param token - Characters between separators.
 * @param start - Index of the token in the text, for errors.
 * @returns {Square} The square.
 */
function nameOf(token: string, start: number): Square {
  const [file = "", rank, extra] = Array.from(token);
  if (!/^[a-h]$/iu.test(file)) {
    const hint = file === "(" ? "; for (file, rank) pairs, set pairs" : "";
    throw new DecodeError(NAME, `${named(file)} is not a file, a to h${hint}`, start);
  }
  if (rank === undefined) {
    throw new DecodeError(NAME, `"${token}" at index ${start} has no rank`, start);
  }
  if (!/^[1-8]$/u.test(rank)) {
    throw new DecodeError(NAME, `${named(rank)} is not a rank, 1 to 8`, start + 1);
  }
  if (extra !== undefined) {
    const square = `${file}${rank}`.toLowerCase();
    throw new DecodeError(NAME, `${named(extra)} follows the square ${square}`, start + 2);
  }
  return { file: FILES.indexOf(file.toLowerCase()), rank: Number(rank) - 1 };
}

/**
 * Skips the characters of a set.
 *
 * @param text - The text.
 * @param start - Where to start.
 * @param characters - What to skip.
 * @returns {number} The index of the first character outside the set.
 */
function skip(text: string, start: number, characters: string): number {
  let at = start;
  while (at < text.length && characters.includes(text.charAt(at))) at += 1;
  return at;
}

/**
 * The character at an index, as a whole code point.
 *
 * @param text - The text.
 * @param at - An index inside it.
 * @returns {string} The character.
 */
function characterAt(text: string, at: number): string {
  return String.fromCodePoint(text.codePointAt(at)!);
}

/**
 * Steps over one punctuation mark of a pair, spaces before it allowed.
 *
 * @param text - The text.
 * @param start - Where the mark may start, after spaces.
 * @param mark - `(`, `,` or `)`.
 * @param pair - Index of the pair, for errors.
 * @returns {number} The index after the mark.
 */
function passMark(text: string, start: number, mark: string, pair: number): number {
  const at = skip(text, start, SPACE);
  if (at >= text.length) {
    throw new DecodeError(NAME, `the pair at index ${pair} ends before its ${mark}`);
  }
  if (text[at] !== mark) {
    const hint = mark === "(" ? "; for names such as e4, leave pairs off" : "";
    throw new DecodeError(NAME, `${named(characterAt(text, at))} where ${mark} goes${hint}`, at);
  }
  return at + 1;
}

/**
 * Reads the file or the rank of a pair: one digit from 0 to 7.
 *
 * @param text - The text.
 * @param start - Where the digit may start, after spaces.
 * @param what - `file` or `rank`, for errors.
 * @param pair - Index of the pair, for errors.
 * @returns {Read<number>} The digit's value.
 */
function coordinate(text: string, start: number, what: string, pair: number): Read<number> {
  const at = skip(text, start, SPACE);
  if (at >= text.length) {
    throw new DecodeError(NAME, `the pair at index ${pair} ends before its ${what}`);
  }
  const character = characterAt(text, at);
  if (!/^[0-7]$/u.test(character)) {
    throw new DecodeError(NAME, `${named(character)} is not a ${what}, 0 to 7`, at);
  }
  return { value: Number(character), next: at + 1 };
}

/**
 * Reads one pair such as `(4, 3)`.
 *
 * @param text - The text.
 * @param start - Index of its `(`.
 * @returns {Read<Square>} The square.
 */
function pairOf(text: string, start: number): Read<Square> {
  const file = coordinate(text, passMark(text, start, "(", start), "file", start);
  const rank = coordinate(text, passMark(text, file.next, ",", start), "rank", start);
  return {
    value: { file: file.value, rank: rank.value },
    next: passMark(text, rank.next, ")", start),
  };
}

/**
 * Reads squares written as pairs, split by whitespace or commas.
 *
 * @param text - The text.
 * @returns {Placed[]} The squares.
 */
function pairsOf(text: string): Placed[] {
  const squares: Placed[] = [];
  let at = skip(text, 0, SEPARATOR);
  while (at < text.length) {
    const pair = pairOf(text, at);
    squares.push({ square: pair.value, at });
    at = skip(text, pair.next, SEPARATOR);
  }
  return squares;
}

/**
 * Reads squares written as names, split by whitespace or commas.
 *
 * @param text - The text.
 * @returns {Placed[]} The squares.
 */
function namesOf(text: string): Placed[] {
  return Array.from(text.matchAll(NUMBER), (match) => ({
    square: nameOf(match[0], match.index),
    at: match.index,
  }));
}

/**
 * Packs squares into a bitboard, each square once.
 *
 * @param squares - The squares and where each one starts.
 * @param layout - How squares are numbered.
 * @returns {Uint8Array} Eight bytes, big-endian, bit i for square i.
 */
function packBitboard(squares: readonly Placed[], layout: ChessLayout): Uint8Array {
  const board = new Uint8Array(BITBOARD_BYTES);
  for (const { square: one, at } of squares) {
    const { byte, mask } = bitboardBit(indexOf(one, layout));
    if ((board[byte]! & mask) !== 0) {
      const name = nameOfSquare(one);
      throw new DecodeError(NAME, `${name} at index ${at} is already on the board`, at);
    }
    board[byte]! |= mask;
  }
  return board;
}

/**
 * Lists the squares a bitboard holds.
 *
 * @param bytes - Eight bytes, big-endian, bit i for square i.
 * @returns {number[]} The square indices, lowest first.
 */
function unpackBitboard(bytes: ArrayLike<number>): number[] {
  if (bytes.length !== BITBOARD_BYTES) {
    throw new EncodingError(`${NAME}: a bitboard is ${BITBOARD_BYTES} bytes, not ${bytes.length}`);
  }
  const indices: number[] = [];
  for (let index = 0; index < 64; index += 1) {
    const { byte, mask } = bitboardBit(index);
    if ((bytes[byte]! & mask) !== 0) indices.push(index);
  }
  return indices;
}

/** Chess squares, one byte each: `e4 d5` is `[28, 35]` from a1, rank by rank. */
export const square: SquareCodec = {
  encode(input, options = {}) {
    requireBytes(`${NAME}: encode`, input);
    const { layout, pairs, bitboard } = squareOptions(options);
    const indices = bitboard ? unpackBitboard(input) : input;
    return Array.from(indices, (byte, at) => {
      if (byte > 63) {
        throw new EncodingError(`${NAME}: byte ${byte} at index ${at} is over 63, the last square`);
      }
      const { file, rank } = squareOf(byte, layout);
      return pairs ? `(${file}, ${rank})` : nameOfSquare({ file, rank });
    }).join(" ");
  },
  decode(text, options = {}) {
    requireText(`${NAME}: decode`, text);
    const { layout, pairs, bitboard } = squareOptions(options);
    const squares = pairs ? pairsOf(text) : namesOf(text);
    if (bitboard) return packBitboard(squares, layout);
    return Uint8Array.from(squares, ({ square: one }) => indexOf(one, layout));
  },
};
