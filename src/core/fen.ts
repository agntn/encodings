import { requireBytes, requireText } from "./bytes.ts";
import { CHESS_LAYOUTS, FILES, indexOf, type ChessLayout } from "./chess.ts";
import { DecodeError, EncodingError, InvalidOptionError, named, quote } from "./errors.ts";

/** Whose move it is: `w` for White, `b` for Black. */
export const FEN_TURNS = ["w", "b"] as const;

/** Side to move, as FEN writes it. */
export type FenTurn = (typeof FEN_TURNS)[number];

/** Everything a FEN says besides where the pieces stand. */
export interface FenFields {
  /** Side to move. */
  turn: FenTurn;
  /** Castling rights, such as `KQkq`, or `-` for none. */
  castling: string;
  /** The square a pawn just skipped, such as `e3`, or `-`. */
  enPassant: string;
  /** Halfmoves since the last capture or pawn move. */
  halfmove: number;
  /** Move number, 1 at the start, up by one after each Black move. */
  fullmove: number;
}

/** How the 64 bytes are laid out and read. */
export interface FenOptions {
  /** Which square is byte 0: `a1` as engines count, `a8` as FEN reads, `file`. Default: `a1`. */
  layout?: ChessLayout;
  /** The board as eight lines of pieces and dots instead of a FEN. Default: false. */
  diagram?: boolean;
}

/** Options for writing a FEN: the layout and the fields after the board. */
export interface FenEncodeOptions extends FenOptions, Partial<FenFields> {}

/** A board read from a FEN or a diagram. */
export interface FenDecoded {
  /** One piece letter per square, `.` for an empty one, in the chosen layout. */
  bytes: Uint8Array;
  /** The fields after the board the text has: all of them in a full FEN, none in a diagram. */
  fields: Partial<FenFields>;
}

/** Chess positions in Forsyth-Edwards Notation, one byte per square. */
export interface FenCodec {
  /**
   * Writes a board as a FEN or a diagram.
   *
   * @param bytes - 64 bytes, a piece letter or `.` each.
   * @param options - Layout, diagram, and the fields after the board.
   * @returns {string} The FEN, or eight lines of the board.
   */
  encode(bytes: Uint8Array, options?: Readonly<FenEncodeOptions>): string;
  /**
   * Reads a FEN or a diagram.
   *
   * @param text - The FEN, or the diagram with `diagram` set.
   * @param options - Layout and diagram.
   * @returns {FenDecoded} The 64 bytes and the fields after the board.
   */
  decode(text: string, options?: Readonly<FenOptions>): FenDecoded;
}

/** A word of the text and where it starts. */
interface Token {
  readonly text: string;
  readonly at: number;
}

const NAME = "fen";

/** Piece letters, White in capitals. */
const PIECES = "PNBRQKpnbrqk";

/** The byte of an empty square. */
const EMPTY = ".";

/** Squares on a board. */
const SQUARES = 64;

/** Castling rights in the order FEN writes them. */
const CASTLING = "KQkq";

/** The fields after the board, by option name. */
const FIELDS = ["turn", "castling", "enPassant", "halfmove", "fullmove"] as const;

/** The fields after the board, in order, as an error names them. */
const FIELD_NAMES = [
  "a side to move",
  "castling rights",
  "an en passant square",
  "a halfmove clock",
  "a move number",
] as const;

const TURN_REASON = "use w or b";
const CASTLING_REASON = "use K, Q, k and q, each once and in that order, or -";
const PASSANT_REASON = "use a square on rank 3 or 6, or -";

/** What splits the fields: spaces, and the line breaks of wrapped text. */
const BLANKS = /[^\t\n\r ]+/gu;

/**
 * Checks the layout and the diagram switch, which callers without types can pass as anything.
 *
 * @param options - Options from the caller.
 * @returns {Required<FenOptions>} The options with their defaults.
 */
function boardOptions(options: Readonly<FenOptions>): Required<FenOptions> {
  const { layout = "a1", diagram = false } = options;
  if (!(CHESS_LAYOUTS as readonly unknown[]).includes(layout)) {
    throw new InvalidOptionError("layout", layout, `use one of ${CHESS_LAYOUTS.join(", ")}`);
  }
  if (typeof diagram !== "boolean") {
    throw new InvalidOptionError("diagram", diagram, "must be a boolean");
  }
  return { layout, diagram };
}

/**
 * Reads castling rights: `-`, or some of K, Q, k and q, each once and in that order.
 *
 * @param text - The rights.
 * @returns {number} Index of the first character at fault, or -1 when they are fine.
 */
function castlingFault(text: string): number {
  if (text === "-") return -1;
  let last = -1;
  for (const [at, letter] of Array.from(text).entries()) {
    const rank = CASTLING.indexOf(letter);
    if (rank <= last) return at;
    last = rank;
  }
  return text === "" ? 0 : -1;
}

/**
 * Whether a square name can be an en passant target: a file, then rank 3 or 6.
 *
 * @param text - The square, or `-`.
 * @returns {boolean} Whether it fits.
 */
function passantFits(text: string): boolean {
  return text === "-" || /^[a-h][36]$/u.test(text);
}

/**
 * Checks one clock option, a whole number from a lowest value up.
 *
 * @param name - The option.
 * @param value - Its value.
 * @param least - The lowest value it takes.
 * @returns {number} The value.
 */
function clockOption(name: string, value: unknown, least: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < least) {
    throw new InvalidOptionError(name, value, `must be a whole number, ${least} or more`);
  }
  return value;
}

/**
 * Checks one text field given as an option.
 *
 * @param name - The option.
 * @param value - Its value, the default when left out.
 * @param check - Whether the text fits the field, and what the field takes.
 * @returns {string} The value.
 */
function textOption(
  name: string,
  value: unknown,
  check: Readonly<{ fits: (text: string) => boolean; reason: string }>,
): string {
  if (typeof value !== "string" || !check.fits(value)) {
    throw new InvalidOptionError(name, value, check.reason);
  }
  return value;
}

/**
 * Checks the fields of a FEN given as options, filling in the ones left out.
 *
 * @param options - Options from the caller.
 * @returns {FenFields} The fields to write.
 */
function fieldOptions(options: Readonly<Partial<FenFields>>): FenFields {
  const turn = textOption("turn", options.turn ?? "w", {
    fits: (text) => FEN_TURNS.includes(text as FenTurn),
    reason: TURN_REASON,
  });
  const castling = textOption("castling", options.castling ?? "-", {
    fits: (text) => castlingFault(text) === -1,
    reason: CASTLING_REASON,
  });
  const enPassant = textOption("enPassant", options.enPassant ?? "-", {
    fits: passantFits,
    reason: PASSANT_REASON,
  });
  const halfmove = clockOption("halfmove", options.halfmove ?? 0, 0);
  const fullmove = clockOption("fullmove", options.fullmove ?? 1, 1);
  return { turn: turn as FenTurn, castling, enPassant, halfmove, fullmove };
}

/**
 * Refuses the fields of a FEN next to `diagram`, which has nowhere to write them.
 *
 * @param options - Options from the caller.
 */
function refuseFields(options: Readonly<Partial<FenFields>>): void {
  const given = FIELDS.find((name) => options[name] !== undefined);
  if (given !== undefined) {
    throw new InvalidOptionError(given, options[given], "a diagram shows the board alone");
  }
}

/**
 * Checks the bytes of a board: 64 of them, each a piece letter or `.`.
 *
 * @param bytes - The board.
 */
function checkBoard(bytes: ArrayLike<number>): void {
  if (bytes.length !== SQUARES) {
    throw new EncodingError(`${NAME}: a board is ${SQUARES} bytes, not ${bytes.length}`);
  }
  for (let at = 0; at < SQUARES; at += 1) {
    const byte = bytes[at]!;
    if (!`${PIECES}${EMPTY}`.includes(String.fromCodePoint(byte))) {
      throw new EncodingError(
        `${NAME}: byte ${byte} at index ${at} is not a piece; use PNBRQK, pnbrqk or . for empty`,
      );
    }
  }
}

/**
 * The cells of one rank, file a first.
 *
 * @param bytes - The board.
 * @param rank - 0 for rank 1 up to 7 for rank 8.
 * @param layout - How squares are numbered.
 * @returns {string[]} A piece letter or `.` per file.
 */
function cells(bytes: ArrayLike<number>, rank: number, layout: ChessLayout): string[] {
  return Array.from(FILES, (_, file) =>
    String.fromCodePoint(bytes[indexOf({ file, rank }, layout)]!),
  );
}

/**
 * Writes one rank of the board as FEN, empty squares counted.
 *
 * @param row - A piece letter or `.` per file.
 * @returns {string} Such as `4P3`.
 */
function placementRank(row: readonly string[]): string {
  return row.join("").replaceAll(/\.+/gu, (run) => String(run.length));
}

/**
 * Lists the ranks of the board from rank 8 down, as FEN and a diagram both read it.
 *
 * @param bytes - The board.
 * @param layout - How squares are numbered.
 * @returns {string[][]} The cells of each rank.
 */
function ranksDown(bytes: ArrayLike<number>, layout: ChessLayout): string[][] {
  return Array.from({ length: 8 }, (_, row) => cells(bytes, 7 - row, layout));
}

/**
 * Splits the text into words split by whitespace, each with its index.
 *
 * @param text - The text.
 * @returns {Token[]} The words.
 */
function tokens(text: string): Token[] {
  return Array.from(text.matchAll(BLANKS), (match) => ({ text: match[0], at: match.index }));
}

/** One rank of the placement: its text, where it starts, and its rank, 0 for rank 1. */
interface RankText extends Token {
  readonly rank: number;
}

/**
 * Splits the placement into its ranks, 8 down to 1.
 *
 * @param token - The placement.
 * @returns {RankText[]} The eight ranks.
 */
function placementRanks(token: Token): RankText[] {
  const parts = token.text.split("/");
  if (parts.length > 8) {
    const at = token.at + parts.slice(0, 8).join("/").length;
    throw new DecodeError(NAME, `the board has more than 8 ranks at index ${at}`, at);
  }
  if (parts.length < 8) {
    const at = token.at + token.text.length;
    throw new DecodeError(NAME, `the board has ${parts.length} ranks, not 8`, at);
  }
  let at = token.at;
  return parts.map((text, row) => {
    const part = { text, at, rank: 7 - row };
    at += text.length + 1;
    return part;
  });
}

/**
 * Reads one character of a rank: a piece, or a count of empty squares.
 *
 * @param character - The character.
 * @param at - Its index in the text.
 * @param counted - Whether the character before it was a count.
 * @returns {string[]} The cells it fills.
 */
function rankCell(character: string, at: number, counted: boolean): string[] {
  if (PIECES.includes(character)) return [character];
  if (!/^[1-8]$/u.test(character)) {
    throw new DecodeError(NAME, `${named(character)} at index ${at} is not a piece or a count`, at);
  }
  if (counted) {
    const message = `${named(character)} at index ${at} follows another count; add them up`;
    throw new DecodeError(NAME, message, at);
  }
  return Array.from({ length: Number(character) }, () => EMPTY);
}

/**
 * Reads one rank of the placement into its eight cells, file a first.
 *
 * @param part - The rank.
 * @returns {string[]} A piece letter or `.` per file.
 */
function rankCells(part: RankText): string[] {
  const row: string[] = [];
  let at = part.at;
  let counted = false;
  for (const character of part.text) {
    const filled = rankCell(character, at, counted);
    if (row.length + filled.length > 8) {
      throw new DecodeError(NAME, `rank ${part.rank + 1} runs past the h file at index ${at}`, at);
    }
    row.push(...filled);
    counted = filled[0] === EMPTY;
    at += character.length;
  }
  if (row.length < 8) {
    const message = `rank ${part.rank + 1} has ${row.length} squares, not 8, at index ${at}`;
    throw new DecodeError(NAME, message, at);
  }
  return row;
}

/**
 * Lays rows of cells out as the 64 bytes of a board.
 *
 * @param rows - Eight rows of eight cells, rank 8 first.
 * @param layout - How squares are numbered.
 * @returns {Uint8Array} The board.
 */
function boardOf(rows: readonly (readonly string[])[], layout: ChessLayout): Uint8Array {
  const board = new Uint8Array(SQUARES);
  for (const [row, cellsOfRank] of rows.entries()) {
    for (const [file, cell] of cellsOfRank.entries()) {
      board[indexOf({ file, rank: 7 - row }, layout)] = cell.codePointAt(0)!;
    }
  }
  return board;
}

/**
 * Reads the placement field: eight ranks from 8 down, split by `/`.
 *
 * @param token - The field.
 * @param layout - How squares are numbered.
 * @returns {Uint8Array} The board.
 */
function readPlacement(token: Token, layout: ChessLayout): Uint8Array {
  return boardOf(placementRanks(token).map(rankCells), layout);
}

/** What is wrong with a field: the advice, and how far into the field the fault sits. */
interface Fault {
  readonly reason: string;
  readonly offset: number;
}

/**
 * Finds the first character of a field outside a pattern of one character each.
 *
 * @param text - The field.
 * @param fits - Whether the character at an offset belongs there.
 * @returns {number} Its offset, or -1 when every character fits.
 */
function firstMisfit(text: string, fits: (character: string, offset: number) => boolean): number {
  const at = Array.from(text).findIndex((character, offset) => !fits(character, offset));
  return at === -1 ? -1 : Array.from(text).slice(0, at).join("").length;
}

/**
 * Finds what is wrong with an en passant field.
 *
 * @param text - The field.
 * @returns {Fault | undefined} The fault, or nothing when it fits.
 */
function passantFault(text: string): Fault | undefined {
  if (passantFits(text)) return undefined;
  const misfit = firstMisfit(text, (character, offset) =>
    (offset === 0 ? /^[a-h]$/u : /^[36]$/u).test(character),
  );
  const offset = misfit === -1 ? Math.min(text.length, 2) : misfit;
  return { reason: PASSANT_REASON, offset: offset === text.length ? 0 : offset };
}

/**
 * Finds what is wrong with a clock field.
 *
 * @param text - The field.
 * @param least - The lowest value it takes.
 * @returns {Fault | undefined} The fault, or nothing when it fits.
 */
function clockFault(text: string, least: number): Fault | undefined {
  const offset = firstMisfit(text, (character) => /^\d$/u.test(character));
  if (offset === -1 && Number(text) >= least) return undefined;
  return { reason: `use a whole number, ${least} or more`, offset: Math.max(0, offset) };
}

/**
 * Says what a field after the board should have held, and where it goes wrong.
 *
 * @param text - The field.
 * @param field - Its place after the board, from 0.
 * @returns {Fault | undefined} The fault, or nothing when the field fits.
 */
function fieldFault(text: string, field: number): Fault | undefined {
  if (field === 0) {
    return FEN_TURNS.includes(text as FenTurn) ? undefined : { reason: TURN_REASON, offset: 0 };
  }
  if (field === 1) {
    const offset = castlingFault(text);
    return offset === -1 ? undefined : { reason: CASTLING_REASON, offset };
  }
  if (field === 2) return passantFault(text);
  return clockFault(text, field === 3 ? 0 : 1);
}

/** Longest field an error quotes; a longer one goes by its length. */
const QUOTED_FIELD = 24;

/**
 * Names a field for an error: quoted when short, by its length when not.
 *
 * @param token - The field.
 * @returns {string} Such as `"KQkx" at index 46`.
 */
function fieldLabel(token: Token): string {
  const text =
    token.text.length > QUOTED_FIELD
      ? `a field of ${token.text.length} characters`
      : quote(token.text);
  return `${text} at index ${token.at}`;
}

/**
 * Words a fault in a field, naming the character at fault when it is not the first one.
 *
 * @param token - The field.
 * @param what - What the field should be, such as `castling rights`.
 * @param fault - The advice and where the fault sits.
 * @returns {string} The message.
 */
function faultMessage(token: Token, what: string, fault: Fault): string {
  const head = `${fieldLabel(token)} is not ${what}`;
  if (fault.offset === 0) return `${head}; ${fault.reason}`;
  const at = token.at + fault.offset;
  return `${head}, ${named(characterAt(token.text, fault.offset))} at index ${at} is out of place; ${fault.reason}`;
}

/**
 * The character at an offset, as a whole code point.
 *
 * @param text - The text.
 * @param offset - An index inside it.
 * @returns {string} The character.
 */
function characterAt(text: string, offset: number): string {
  return String.fromCodePoint(text.codePointAt(offset)!);
}

/**
 * Reads the fields after the board. A FEN cut short after the board, or after any field, keeps
 * the fields it has, as python-chess reads it.
 *
 * @param rest - The fields after the board.
 * @returns {Partial<FenFields>} The fields the text has.
 */
function readFields(rest: readonly Token[]): Partial<FenFields> {
  const extra = rest[5];
  if (extra !== undefined) {
    const message = `${fieldLabel(extra)} follows the move number`;
    throw new DecodeError(NAME, message, extra.at);
  }
  for (const [field, token] of rest.entries()) {
    const fault = fieldFault(token.text, field);
    if (fault !== undefined) {
      throw new DecodeError(
        NAME,
        faultMessage(token, FIELD_NAMES[field]!, fault),
        token.at + fault.offset,
      );
    }
  }
  const [turn, castling, enPassant, halfmove, fullmove] = rest;
  return {
    ...(turn === undefined ? {} : { turn: turn.text as FenTurn }),
    ...(castling === undefined ? {} : { castling: castling.text }),
    ...(enPassant === undefined ? {} : { enPassant: enPassant.text }),
    ...(halfmove === undefined ? {} : { halfmove: clockValue(halfmove) }),
    ...(fullmove === undefined ? {} : { fullmove: clockValue(fullmove) }),
  };
}

/**
 * Reads a clock, refusing one too large to count exactly.
 *
 * @param token - The field.
 * @returns {number} The value.
 */
function clockValue(token: Token): number {
  const value = Number(token.text);
  if (!Number.isSafeInteger(value)) {
    const message = `${fieldLabel(token)} is too large to count`;
    throw new DecodeError(NAME, message, token.at);
  }
  return value;
}

/**
 * Reads a FEN.
 *
 * @param text - The FEN.
 * @param layout - How squares are numbered.
 * @returns {FenDecoded} The board and the fields.
 */
function readFen(text: string, layout: ChessLayout): FenDecoded {
  const [placement, ...rest] = tokens(text);
  if (placement === undefined) throw new DecodeError(NAME, "there is no board in the text");
  return { bytes: readPlacement(placement, layout), fields: readFields(rest) };
}

/**
 * Reads one line of a diagram into its eight cells, spaces between them optional.
 *
 * @param line - The line and where it starts.
 * @param rank - Its rank, 0 for rank 1.
 * @returns {string[]} A piece letter or `.` per file.
 */
function diagramCells(line: Token, rank: number): string[] {
  const row: string[] = [];
  let at = line.at;
  for (const character of line.text) {
    if (character !== " " && character !== "\t") {
      if (character !== EMPTY && !PIECES.includes(character)) {
        throw new DecodeError(NAME, `${named(character)} at index ${at} is not a piece or a .`, at);
      }
      if (row.length === 8) {
        throw new DecodeError(NAME, `rank ${rank + 1} runs past the h file at index ${at}`, at);
      }
      row.push(character);
    }
    at += character.length;
  }
  if (row.length < 8) {
    throw new DecodeError(
      NAME,
      `rank ${rank + 1} has ${row.length} squares, not 8, at index ${at}`,
      at,
    );
  }
  return row;
}

/**
 * Reads a diagram: eight lines, rank 8 first, a piece letter or `.` per square.
 *
 * @param text - The diagram.
 * @param layout - How squares are numbered.
 * @returns {FenDecoded} The board, without fields.
 */
function readDiagram(text: string, layout: ChessLayout): FenDecoded {
  const lines = Array.from(text.matchAll(/[^\n\r]*[^\t\n\r ][^\n\r]*/gu), (match) => ({
    text: match[0],
    at: match.index,
  }));
  if (lines.length !== 8) {
    throw new DecodeError(NAME, `a diagram has 8 lines, not ${lines.length}`);
  }
  return {
    bytes: boardOf(
      lines.map((line, row) => diagramCells(line, 7 - row)),
      layout,
    ),
    fields: {},
  };
}

/** Chess positions in FEN: the board as 64 bytes, a piece letter or `.` per square. */
export const fen: FenCodec = {
  encode(input, options = {}) {
    requireBytes(`${NAME}: encode`, input);
    const { layout, diagram } = boardOptions(options);
    checkBoard(input);
    const ranks = ranksDown(input, layout);
    if (diagram) {
      refuseFields(options);
      return ranks.map((row) => row.join(" ")).join("\n");
    }
    const { turn, castling, enPassant, halfmove, fullmove } = fieldOptions(options);
    const placement = ranks.map(placementRank).join("/");
    return `${placement} ${turn} ${castling} ${enPassant} ${halfmove} ${fullmove}`;
  },
  decode(text, options = {}) {
    requireText(`${NAME}: decode`, text);
    const { layout, diagram } = boardOptions(options);
    return diagram ? readDiagram(text, layout) : readFen(text, layout);
  },
};
