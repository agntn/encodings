import { DecodeError, InvalidOptionError, named } from "./errors.ts";

/** IBM EBCDIC 037, 273, 500, 1140 and 1141 (037 and 273 with €), ISO 8859-1 and Windows-1252. */
export const CODE_PAGES = [
  "ibm037",
  "ibm273",
  "ibm500",
  "ibm1140",
  "ibm1141",
  "latin1",
  "windows1252",
] as const;

export type CodePage = (typeof CODE_PAGES)[number];

export interface CharsetOptions {
  /** Code page the bytes belong to. */
  readonly codepage: CodePage;
}

/** Bytes 0x00 to 0x3F, the controls every EBCDIC page here shares. */
const EBCDIC_CONTROLS =
  "\u0000\u0001\u0002\u0003\u009C\u0009\u0086\u007F\u0097\u008D\u008E\u000B\u000C\u000D\u000E\u000F" +
  "\u0010\u0011\u0012\u0013\u009D\u0085\u0008\u0087\u0018\u0019\u0092\u008F\u001C\u001D\u001E\u001F" +
  "\u0080\u0081\u0082\u0083\u0084\u000A\u0017\u001B\u0088\u0089\u008A\u008B\u008C\u0005\u0006\u0007" +
  "\u0090\u0091\u0016\u0093\u0094\u0095\u0096\u0004\u0098\u0099\u009A\u009B\u0014\u0015\u009E\u001A";

/** The EBCDIC tables, byte 0x00 first, from the round-trip mappings of IBM's ICU tables. */
const IBM037 =
  EBCDIC_CONTROLS +
  "  âäàáãåçñ¢.<(+|&éêëèíîïìß!$*);¬-/ÂÄÀÁÃÅÇÑ¦,%_>?øÉÊËÈÍÎÏÌ`:#@'=\"" +
  "Øabcdefghi«»ðýþ±°jklmnopqrªºæ¸Æ¤µ~stuvwxyz¡¿ÐÝÞ®^£¥·©§¶¼½¾[]¯¨´×" +
  "{ABCDEFGHI­ôöòóõ}JKLMNOPQR¹ûüùúÿ\\÷STUVWXYZ²ÔÖÒÓÕ0123456789³ÛÜÙÚ\u009F";
const IBM273 =
  EBCDIC_CONTROLS +
  "  â{àáãåçñÄ.<(+!&éêëèíîïì~Ü$*);^-/Â[ÀÁÃÅÇÑö,%_>?øÉÊËÈÍÎÏÌ`:#§'=\"" +
  "Øabcdefghi«»ðýþ±°jklmnopqrªºæ¸Æ¤µßstuvwxyz¡¿ÐÝÞ®¢£¥·©@¶¼½¾¬|¯¨´×" +
  "äABCDEFGHI­ô¦òóõüJKLMNOPQR¹û}ùúÿÖ÷STUVWXYZ²Ô\\ÒÓÕ0123456789³Û]ÙÚ\u009F";
const IBM500 =
  EBCDIC_CONTROLS +
  "  âäàáãåçñ[.<(+!&éêëèíîïìß]$*);^-/ÂÄÀÁÃÅÇÑ¦,%_>?øÉÊËÈÍÎÏÌ`:#@'=\"" +
  "Øabcdefghi«»ðýþ±°jklmnopqrªºæ¸Æ¤µ~stuvwxyz¡¿ÐÝÞ®¢£¥·©§¶¼½¾¬|¯¨´×" +
  "{ABCDEFGHI­ôöòóõ}JKLMNOPQR¹ûüùúÿ\\÷STUVWXYZ²ÔÖÒÓÕ0123456789³ÛÜÙÚ\u009F";

/** ISO 8859-1: every byte is the code point of the same number. */
const LATIN1 = String.fromCodePoint(...Array.from({ length: 256 }, (_, byte) => byte));

/** Windows-1252 bytes 0x80 to 0x9F as WHATWG reads them; the rest is Latin-1. */
const WINDOWS1252_C1 = "€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F\u0090‘’“”•–—˜™š›œ\u009DžŸ";

/**
 * Puts the euro sign on byte 0x9F, which is how IBM made 1140 from 037 and 1141 from 273.
 *
 * @param table - The table without it.
 * @returns {string} The same table with € in place of ¤ at 0x9F.
 */
function withEuro(table: string): string {
  return `${table.slice(0, 0x9f)}€${table.slice(0xa0)}`;
}

const TABLES: Readonly<Record<CodePage, string>> = {
  ibm037: IBM037,
  ibm273: IBM273,
  ibm500: IBM500,
  ibm1140: withEuro(IBM037),
  ibm1141: withEuro(IBM273),
  latin1: LATIN1,
  windows1252: `${LATIN1.slice(0, 0x80)}${WINDOWS1252_C1}${LATIN1.slice(0xa0)}`,
};

/**
 * Finds the table of a code page, refusing a name that is not one.
 *
 * @param options - The options as the caller passed them.
 * @returns {{ name: CodePage; table: string }} The code page and its 256 characters.
 */
function lookup(options: CharsetOptions): { name: CodePage; table: string } {
  const name = options.codepage;
  if (!Object.hasOwn(TABLES, name)) {
    throw new InvalidOptionError("codepage", name, `use one of ${CODE_PAGES.join(", ")}`);
  }
  return { name, table: TABLES[name] };
}

/**
 * One character per byte, in another character set, so code pages sit outside the registry.
 * `toText` cannot fail; `fromText` refuses a character the page lacks.
 */
export const charsets = {
  /**
   * Reads bytes as text in a code page.
   *
   * @param bytes - Bytes in that code page.
   * @param options - The code page.
   * @returns {string} One character per byte.
   */
  toText(bytes: Uint8Array, options: CharsetOptions): string {
    const { table } = lookup(options);
    let out = "";
    for (const byte of bytes) out += table[byte]!;
    return out;
  },

  /**
   * Writes text as bytes in a code page.
   *
   * @param text - Text made of characters the code page has.
   * @param options - The code page.
   * @returns {Uint8Array} One byte per character.
   */
  fromText(text: string, options: CharsetOptions): Uint8Array {
    const { name, table } = lookup(options);
    const bytes = new Map(table.split("").map((character, byte) => [character, byte] as const));
    const out: number[] = [];
    let index = 0;
    for (const character of text) {
      const byte = bytes.get(character);
      if (byte === undefined) {
        throw new DecodeError(name, `${named(character)} at index ${index} has no byte`, index);
      }
      out.push(byte);
      index += character.length;
    }
    return Uint8Array.from(out);
  },
} as const;
