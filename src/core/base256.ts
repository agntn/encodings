import { byAlphabet } from "./alphabets.ts";
import { graphemes } from "./bytes.ts";
import { DecodeError, EncodingError, InvalidOptionError, named, quote } from "./errors.ts";

/** The base256 alphabets, in the order `info().options` lists them. */
export const BASE256_ALPHABETS = ["emoji"] as const;

/** A base256 alphabet: the multiformats base256emoji table (`emoji`). */
export type Base256Alphabet = (typeof BASE256_ALPHABETS)[number];

/** The base256emoji table of multiformats: one emoji per byte value, from 0 to 255. */
const EMOJI =
  "🚀🪐☄🛰🌌🌑🌒🌓🌔🌕🌖🌗🌘🌍🌏🌎🐉☀💻🖥💾💿😂❤😍🤣😊🙏💕😭😘👍😅👏😁🔥🥰💔💖💙😢🤔😆🙄💪😉☺👌🤗💜😔😎😇🌹🤦🎉💞✌✨🤷😱😌🌸🙌😋💗💚😏💛🙂💓🤩😄😀🖤😃💯🙈👇🎶😒🤭❣😜💋👀😪😑💥🙋😞😩😡🤪👊🥳😥🤤👉💃😳✋😚😝😴🌟😬🙃🍀🌷😻😓⭐✅🥺🌈😈🤘💦✔😣🏃💐☹🎊💘😠☝😕🌺🎂🌻😐🖕💝🙊😹🗣💫💀👑🎵🤞😛🔴😤🌼😫⚽🤙☕🏆🤫👈😮🙆🍻🍃🐶💁😲🌿🧡🎁⚡🌞🎈❌✊👋😰🤨😶🤝🚶💰🍓💢🤟🙁🚨💨🤬✈🎀🍺🤓😙💟🌱😖👶🥴▶➡❓💎💸⬇😨🌚🦋😷🕺⚠🙅😟😵👎🤲🤠🤧📌🔵💅🧐🐾🍒😗🤑🌊🤯🐷☎💧😯💆👆🎤🙇🍑❄🌴💣🐸💌📍🥀🤢👅💡💩👐📸👻🤐🤮🎼🥵🚩🍎🍊👼💍📣🥂";

/** The multibase prefix of base256emoji text. */
const MULTIBASE = "🚀";

/** How text in a table of symbols reads. */
export interface Base256Options {
  /** Alphabet to use when no `symbols` or `sample` replaces it. Default: `emoji`. */
  alphabet?: Base256Alphabet;
  /** Symbols for 0 upward in place of `alphabet`, 2 to 256; under 256 they spell digits. */
  symbols?: string;
  /** Text whose symbols, in the order they first appear, make the table in place of `symbols`. */
  sample?: string;
  /** The 🚀 multibase prefix, before text in the `emoji` alphabet only. Default: false. */
  multibase?: boolean;
}

/** A checked table of symbols. */
interface Table {
  /** Each symbol as given, by digit. */
  spelled: readonly string[];
  /** Digit by symbol, without emoji presentation selectors. */
  digits: Readonly<Record<string, number>>;
  /** Whether a symbol spans more than one code point, so text splits into graphemes. */
  clusters: boolean;
  /** Code points in the longest symbol. */
  longest: number;
}

/** One symbol of the text with its UTF-16 index. */
interface Piece {
  segment: string;
  index: number;
}

/** ASCII whitespace, one grapheme of it: CR LF is a single grapheme. */
const WHITESPACE = /^[\t\n\f\r ]+$/u;

/** Text and emoji presentation selectors, which change how a symbol looks, not which it is. */
const PRESENTATION = /[︎️]/gu;

/** A grapheme of format characters and marks alone, such as zero-width characters in a row. */
const INVISIBLE = /^[\p{Cf}\p{M}]+$/u;

/**
 * The symbol a piece of text stands for: itself without presentation selectors.
 *
 * @param segment - A code point or a grapheme.
 * @returns {string} The symbol, empty for a lone selector.
 */
function keyOf(segment: string): string {
  return segment.replaceAll(PRESENTATION, "");
}

/**
 * Names a symbol for a message: by code point when it is one, quoted when it is a grapheme.
 *
 * @param symbol - A symbol without presentation selectors.
 * @returns {string} Such as `"a" (U+0061)` or `"🇵🇱"`.
 */
function nameOf(symbol: string): string {
  const points = Array.from(symbol);
  return points.length === 1 || points.length > 8 ? named(points[0]!) : quote(symbol);
}

/**
 * Reads one grapheme as digits: a symbol of the table, or else symbols the text ran together,
 * such as 🇵 and 🇱 written side by side, taking the longest match first.
 *
 * @param key - The grapheme without presentation selectors.
 * @param checked - The table.
 * @param index - Index of the grapheme in the text, for errors.
 * @returns {number[]} The digits it spells.
 */
function digitsOf(key: string, checked: Readonly<Table>, index: number): number[] {
  const { digits, longest } = checked;
  const points = Array.from(key);
  const out: number[] = [];
  let at = 0;
  while (at < points.length) {
    let end = Math.min(points.length, at + longest);
    while (end > at && !Object.hasOwn(digits, points.slice(at, end).join(""))) end--;
    if (end === at) throw new DecodeError("base256", `${nameOf(key)} is not in the table`, index);
    out.push(digits[points.slice(at, end).join("")]!);
    at = end;
  }
  return out;
}

/**
 * Splits a table into symbols: graphemes, but zero-width characters one by one.
 *
 * @param text - The symbols as the caller wrote them.
 * @returns {string[]} The symbols in order.
 */
function symbolsOf(text: string): string[] {
  return Array.from(graphemes(text), (entry) => entry.segment)
    .flatMap((segment) => (INVISIBLE.test(segment) ? Array.from(segment) : [segment]))
    .filter((segment) => keyOf(segment) !== "" && !WHITESPACE.test(segment));
}

/**
 * Builds a table from symbols, each one a digit in the order given.
 *
 * @param option - The option the symbols came from, for errors.
 * @param given - The option value.
 * @param distinct - Whether a repeated symbol is an error rather than a later sighting.
 * @returns {Table} The table.
 */
function tableOf(option: string, given: string, distinct: boolean): Table {
  const spelled: string[] = [];
  const digits: Record<string, number> = {};
  for (const symbol of symbolsOf(given)) {
    const key = keyOf(symbol);
    if (!Object.hasOwn(digits, key)) {
      digits[key] = spelled.length;
      spelled.push(symbol);
    } else if (distinct) {
      throw new InvalidOptionError(option, given, `repeats ${nameOf(key)}`);
    }
  }
  if (spelled.length < 2 || spelled.length > 256) {
    throw new InvalidOptionError(option, given, "needs 2 to 256 different symbols");
  }
  const longest = Math.max(...spelled.map((symbol) => Array.from(keyOf(symbol)).length));
  return { spelled, digits, clusters: longest > 1, longest };
}

/** The symbols of each alphabet, by name. */
const ALPHABETS: Readonly<Record<Base256Alphabet, string>> = { emoji: EMOJI };

/** The `emoji` table, built on first use. */
let emoji: Table | undefined;

/**
 * Refuses options that name two tables, or the multibase prefix without the emoji alphabet.
 *
 * @param options - Options from the caller.
 */
function checkSources(options: Readonly<Base256Options>): void {
  const { symbols, sample, multibase = false } = options;
  if (symbols !== undefined && sample !== undefined) {
    throw new InvalidOptionError("sample", sample, "takes the place of symbols; pass one");
  }
  if (multibase && (symbols ?? sample) !== undefined) {
    throw new InvalidOptionError("multibase", multibase, "goes with the emoji alphabet only");
  }
}

/**
 * Picks the table the options name: `sample`, `symbols` or an alphabet.
 *
 * @param options - Options from the caller.
 * @returns {Table} The table.
 */
function table(options: Readonly<Base256Options>): Table {
  checkSources(options);
  const { symbols, sample } = options;
  if (sample !== undefined) return tableOf("sample", sample, false);
  if (symbols !== undefined) return tableOf("symbols", symbols, true);
  const alphabet = byAlphabet(ALPHABETS, options.alphabet, "emoji");
  emoji ??= tableOf("alphabet", alphabet, true);
  return emoji;
}

/**
 * Splits text into the pieces a table reads, one at a time so a stray first symbol ends it.
 *
 * @param text - The text.
 * @param from - Index to start at.
 * @param clusters - Whether to split into graphemes rather than code points.
 * @yields {Piece} Each piece with its index in the text.
 */
function* piecesOf(text: string, from: number, clusters: boolean): Generator<Piece> {
  if (clusters) {
    for (const { segment, index } of graphemes(text.slice(from))) {
      yield { segment, index: index + from };
    }
    return;
  }
  let index = from;
  for (const segment of text.slice(from)) {
    yield { segment, index };
    index += segment.length;
  }
}

/**
 * Finds where the data starts: after the multibase prefix when there is one.
 *
 * @param text - The text.
 * @param multibase - Whether the text starts with the prefix.
 * @returns {number} Index of the first symbol of data.
 */
function start(text: string, multibase: boolean): number {
  if (!multibase) return 0;
  const at = text.search(/[^\t\n\f\r ]|$/u);
  if (!text.startsWith(MULTIBASE, at)) {
    throw new DecodeError("base256", `text does not start with ${named(MULTIBASE)}`, at);
  }
  return at + MULTIBASE.length;
}

/**
 * Base256: one symbol per byte, multiformats base256emoji by default. A table of N symbols
 * reads digits 0 to N - 1. Decoding skips whitespace and presentation selectors.
 */
export const base256 = {
  /**
   * Writes bytes, or digits below the table's size, as symbols.
   *
   * @param bytes - Bytes or digits to write.
   * @param options - The table and the multibase prefix.
   * @returns {string} One symbol per byte.
   */
  encode(bytes: Uint8Array, options: Readonly<Base256Options> = {}): string {
    const { spelled } = table(options);
    const symbols = Array.from(bytes, (byte, index) => {
      const symbol = spelled[byte];
      if (symbol === undefined) {
        throw new EncodingError(
          `base256: byte ${byte} at index ${index} is past the table of ${spelled.length} symbols`,
        );
      }
      return symbol;
    });
    return (options.multibase === true ? MULTIBASE : "") + symbols.join("");
  },

  /**
   * Reads symbols as bytes, or as digits for a table under 256 symbols.
   *
   * @param text - Symbols, optionally spaced.
   * @param options - The table and the multibase prefix.
   * @returns {Uint8Array} One byte per symbol.
   */
  decode(text: string, options: Readonly<Base256Options> = {}): Uint8Array {
    const checked = table(options);
    const out: number[] = [];
    const from = start(text, options.multibase === true);
    for (const { segment, index } of piecesOf(text, from, checked.clusters)) {
      const key = keyOf(segment);
      if (key === "" || WHITESPACE.test(key)) continue;
      const digit = Object.hasOwn(checked.digits, key) ? checked.digits[key] : undefined;
      out.push(...(digit === undefined ? digitsOf(key, checked, index) : [digit]));
    }
    return Uint8Array.from(out);
  },
} as const;
