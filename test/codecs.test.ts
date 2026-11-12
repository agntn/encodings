import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vite-plus/test";
import {
  CHESS_LAYOUTS,
  ChecksumError,
  DecodeError,
  EncodingError,
  InvalidOptionError,
  armor,
  base32,
  base45,
  base58,
  base64,
  base85,
  base91,
  base256,
  bech32,
  bech32m,
  binary,
  charsets,
  CODE_PAGES,
  type RlpInput,
  type RlpItem,
  decimal,
  hex,
  html,
  integer,
  ita2,
  octal,
  prefix,
  quotedPrintable,
  rlp,
  segwit,
  square,
  uuencode,
} from "../src/index.ts";
import { blake256 } from "@agntn/hashes/blake256";
import { crc16Xmodem } from "@agntn/hashes/crc";
import { keccak256 } from "@agntn/hashes/keccak";
import { sha256 } from "@agntn/hashes/sha2";
import { createBase58, createBase58check, type Base58Options } from "../src/base58.ts";
import { fromWords, fromWordsUnsafe, toWords } from "../src/bech32.ts";
import {
  base58checkVariants,
  baudot,
  chessSquares,
  codePages,
  codePoints,
  gnupg,
  gsmg,
  integers,
  javascript,
  monero,
  prefixCodes,
  python,
  whatwg,
} from "./fixtures/references.ts";
import { rlpInvalid, rlpValid, type RlpVector } from "./fixtures/rlp.ts";

const text = (value: string) => new TextEncoder().encode(value);
const read = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

/** RFC 4648 §10. */
const RFC4648 = [
  ["", "", "", ""],
  ["f", "Zg==", "MY======", "CO======"],
  ["fo", "Zm8=", "MZXQ====", "CPNG===="],
  ["foo", "Zm9v", "MZXW6===", "CPNMU==="],
  ["foob", "Zm9vYg==", "MZXW6YQ=", "CPNMUOG="],
  ["fooba", "Zm9vYmE=", "MZXW6YTB", "CPNMUOJ1"],
  ["foobar", "Zm9vYmFy", "MZXW6YTBOI======", "CPNMUOJ1E8======"],
] as const;

describe("RFC 4648 test vectors", () => {
  it.each(RFC4648)("%j", (input, b64, b32, b32h) => {
    expect(base64.encode(text(input))).toBe(b64);
    expect(base32.encode(text(input))).toBe(b32);
    expect(base32.encode(text(input), { alphabet: "hex" })).toBe(b32h);
    expect(hex.encode(text(input))).toBe(Buffer.from(input).toString("hex"));
    expect(read(base64.decode(b64))).toBe(input);
    expect(read(base32.decode(b32))).toBe(input);
    expect(read(base32.decode(b32h, { alphabet: "hex" }))).toBe(input);
    expect(base32.encode(text(input), { padding: false })).toBe(b32.replaceAll("=", ""));
    expect(base32.encode(text(input), { alphabet: "hex", padding: false })).toBe(
      b32h.replaceAll("=", ""),
    );
  });
});

/* base32 with the extended hex alphabet, shaped like the other codecs for the frozen rows. */
const base32hex = {
  encode: (bytes: Uint8Array) => base32.encode(bytes, { alphabet: "hex" }),
  decode: (encoded: string) => base32.decode(encoded, { alphabet: "hex" }),
};

/* base32 with Crockford's alphabet. */
const base32crockford = {
  encode: (bytes: Uint8Array) => base32.encode(bytes, { alphabet: "crockford" }),
  decode: (encoded: string) => base32.decode(encoded, { alphabet: "crockford" }),
};

/* base32 with the z-base-32 alphabet. */
const zbase32 = {
  encode: (bytes: Uint8Array) => base32.encode(bytes, { alphabet: "z" }),
  decode: (encoded: string) => base32.decode(encoded, { alphabet: "z" }),
};

/* base58 with the Base58Check checksum. */
const base58check = {
  encode: (bytes: Uint8Array) => base58.encode(bytes, { check: true }),
  decode: (encoded: string) => base58.decode(encoded, { check: true }),
};

/* base58 with Flickr's alphabet. */
const base58flickr = {
  encode: (bytes: Uint8Array) => base58.encode(bytes, { alphabet: "flickr" }),
  decode: (encoded: string) => base58.decode(encoded, { alphabet: "flickr" }),
};

/* base58 with the XRP Ledger's alphabet. */
const base58ripple = {
  encode: (bytes: Uint8Array) => base58.encode(bytes, { alphabet: "ripple" }),
  decode: (encoded: string) => base58.decode(encoded, { alphabet: "ripple" }),
};

/* base85 with the Ascii85 alphabet. */
const ascii85 = {
  encode: (bytes: Uint8Array, options: Readonly<{ delimiters?: boolean }> = {}) =>
    base85.encode(bytes, { alphabet: "ascii85", ...options }),
  decode: (encoded: string) => base85.decode(encoded, { alphabet: "ascii85" }),
};

/* base85 with the Z85 alphabet. */
const z85 = {
  encode: (bytes: Uint8Array) => base85.encode(bytes, { alphabet: "z85" }),
  decode: (encoded: string) => base85.decode(encoded, { alphabet: "z85" }),
};

/* base58 in Monero's blocks. */
const base58blocks = {
  encode: (bytes: Uint8Array) => base58.encode(bytes, { blocks: true }),
  decode: (encoded: string) => base58.decode(encoded, { blocks: true }),
};

/* base64 with the URL alphabet, unpadded as JWT writes it. */
const base64url = {
  encode: (bytes: Uint8Array) => base64.encode(bytes, { alphabet: "url", padding: false }),
  decode: (encoded: string) => base64.decode(encoded, { alphabet: "url" }),
};

describe("frozen outputs of independent implementations", () => {
  const codecs = {
    base58,
    "base58-flickr": base58flickr,
    "base58-ripple": base58ripple,
    "base58-blocks": base58blocks,
    base91,
    base256,
    "base32-crockford": base32crockford,
    base32,
    base32hex,
    ascii85,
    base45,
    z85,
    base85,
  } as const;

  it.each(python)("matches row $hex without padding", (row) => {
    const bytes = hex.decode(row["hex"]!);
    expect(base32.encode(bytes, { padding: false })).toBe(row["base32"]!.replaceAll("=", ""));
    expect(base32.encode(bytes, { alphabet: "hex", padding: false })).toBe(
      row["base32hex"]!.replaceAll("=", ""),
    );
  });

  it.each([...javascript, ...python, ...monero])("matches row $hex", (row) => {
    const bytes = hex.decode(row["hex"]!);
    for (const [name, codec] of Object.entries(codecs)) {
      const expected = row[name];
      if (expected === undefined) continue;
      expect(codec.encode(bytes), name).toBe(expected);
      expect(hex.encode(codec.decode(expected)), name).toBe(row["hex"]);
    }
    const line = row["uuencodeLine"];
    if (line !== undefined) {
      expect(uuencode.encode(bytes).split("\n")[1]).toBe(line.trimEnd());
      expect(hex.encode(uuencode.decode(line))).toBe(row["hex"]);
    }
  });
});

describe("octal and decimal", () => {
  it("writes one number per byte, spaced or three digits each", () => {
    expect(decimal.encode(text("Hi\n"))).toBe("72 105 10");
    expect(decimal.encode(text("Hi\n"), { separate: false })).toBe("072105010");
    expect(octal.encode(text("Hi\n"))).toBe("110 151 12");
    expect(octal.encode(text("Hi\n"), { separate: false })).toBe("110151012");
  });

  it("reads spaces, commas and runs of three digits", () => {
    expect(read(decimal.decode("72, 105,10\n"))).toBe("Hi\n");
    expect(read(decimal.decode("072105010"))).toBe("Hi\n");
    expect(read(octal.decode("110 151 012"))).toBe("Hi\n");
    expect(read(octal.decode("110151012"))).toBe("Hi\n");
    expect(decimal.decode(" , ")).toEqual(new Uint8Array());
  });

  it("rejects values over a byte, stray digits and runs that do not split", () => {
    expect(() => decimal.decode("72 256")).toThrow('"256" at index 3 is over 255');
    expect(() => octal.decode("400")).toThrow('"400" at index 0 is over 255');
    expect(() => octal.decode("110 18")).toThrow('"8" (U+0038) is not an octal digit');
    expect(() => decimal.decode("7a")).toThrow('"a" (U+0061) is not a decimal digit');
    expect(() => decimal.decode("1234")).toThrow("4 digits at index 0 are not one number");
    expect(() => decimal.decode("72 1x5")).toThrow(
      expect.objectContaining({ name: "DecodeError", encoding: "decimal", index: 4 }),
    );
  });

  it("points a number over a byte at code points, and only in decimal", () => {
    expect(() => decimal.decode("90 97 380")).toThrow(
      '"380" at index 6 is over 255; for Unicode code points, such as 380 for ż, set codepoints',
    );
    expect(() => octal.decode("400")).toThrow(/over 255$/u);
  });
});

describe("decimal code points", () => {
  const codepoints = true;

  it("reads and writes the code points CPython gives", () => {
    expect(read(decimal.decode(codePoints.numbers, { codepoints }))).toBe(codePoints.text);
    expect(decimal.encode(text(codePoints.text), { codepoints })).toBe(codePoints.numbers);
  });

  it("reads a number under 256 as a character, not a byte", () => {
    expect(decimal.decode("233", { codepoints })).toEqual(Uint8Array.of(0xc3, 0xa9));
    expect(decimal.decode("233")).toEqual(Uint8Array.of(0xe9));
  });

  it("takes commas and leading zeros, and spaces code points whatever separate says", () => {
    expect(read(decimal.decode("90,97, 0380\n", { codepoints }))).toBe("Zaż");
    expect(decimal.encode(text("ab"), { codepoints, separate: false })).toBe("97 98");
    expect(decimal.decode(" , ", { codepoints })).toEqual(new Uint8Array());
  });

  it.each([
    [
      "the edges of each UTF-8 length",
      [0, 0x7f, 0x80, 0x7_ff, 0x8_00, 0xff_ff, 0x1_00_00, 0x10_ff_ff],
    ],
    ["the code points around the surrogates", [0xd7_ff, 0xe0_00]],
    ["a leading BOM", [0xfe_ff, 0x41]],
    [
      "line and paragraph separators and NBSP, last too",
      [0x61, 0x20_28, 0x62, 0x20_29, 0x63, 0xa0],
    ],
  ])("reads back %s", (_, points) => {
    const bytes = text(String.fromCodePoint(...points));
    expect(decimal.decode(decimal.encode(bytes, { codepoints }), { codepoints })).toEqual(bytes);
  });

  it("refuses what no text holds, with the index of the number", () => {
    expect(() => decimal.decode("65 1114112", { codepoints })).toThrow(
      expect.objectContaining({
        message: 'decimal: "1114112" at index 3 is over 1114111',
        index: 3,
      }),
    );
    expect(() => decimal.decode("99999999999999999999999", { codepoints })).toThrow(
      "is over 1114111",
    );
    expect(() => decimal.decode("65 55296", { codepoints })).toThrow(
      'decimal: "55296" at index 3 is a surrogate, not a character',
    );
    expect(() => decimal.decode("57343", { codepoints })).toThrow("is a surrogate");
    const party = String.fromCodePoint(0x1_f3_89);
    const halves = party
      .split("")
      .map((unit) => unit.codePointAt(0))
      .join(" ");
    expect(() => decimal.decode(halves, { codepoints })).toThrow(
      '"55356" at index 0 is a surrogate',
    );
    expect(read(decimal.decode("127881", { codepoints }))).toBe(party);
    expect(() => decimal.decode("65 3x2", { codepoints })).toThrow(
      expect.objectContaining({ name: "DecodeError", index: 4 }),
    );
  });

  it("refuses bytes that are not UTF-8 and a codepoints that is not a boolean", () => {
    expect(() => decimal.encode(Uint8Array.of(0xff), { codepoints })).toThrow(
      "decimal: encode with codepoints takes UTF-8 text, and these bytes are not",
    );
    expect(() => decimal.decode("65", { codepoints: "yes" as never })).toThrow(InvalidOptionError);
    expect(() => decimal.encode(text("A"), { codepoints: 1 as never })).toThrow(InvalidOptionError);
  });
});

describe("integer", () => {
  const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

  it("reads one number in each numeral as the same bytes CPython gives", () => {
    const cases = [
      [integers.decimal, {}],
      [integers.octal, { radix: 8 }],
      [integers.base9, { radix: 9 }],
      [integers.bijective9, { radix: 9, bijective: true }],
      [integers.base62, { digits: BASE62 }],
      [integers.bijectiveLetters, { digits: LETTERS, bijective: true }],
    ] as const;
    for (const [number, options] of cases) {
      expect(hex.encode(integer.decode(number, options)), number).toBe(integers.hex);
      expect(integer.encode(hex.decode(integers.hex), options), number).toBe(number);
    }
    const big = BigInt(integers.decimal).toString(16);
    expect(big.padStart(big.length + (big.length % 2), "0")).toBe(integers.hex);
    expect(read(integer.decode(integers.hello))).toBe("Hello");
    expect(integer.encode(text("Hello"))).toBe(integers.hello);
  });

  it("counts spreadsheet columns in bijective letters", () => {
    const column = (name: string) =>
      hex.encode(integer.decode(name, { digits: LETTERS, bijective: true }));
    expect([column("A"), column("Z"), column("AA"), column("XFD")]).toEqual([
      "01",
      "1a",
      "1b",
      "4000",
    ]);
  });

  it("gives leading zero bytes back only through width", () => {
    const key = hex.decode(`0000${"ab".repeat(30)}`);
    const number = integer.encode(key);
    expect(integer.decode(number)).toHaveLength(30);
    expect(integer.decode(number, { width: 32 })).toEqual(key);
    expect(() => integer.decode("256", { width: 1 })).toThrow(
      "integer: the number takes 2 bytes, over width 1",
    );
    expect(() => integer.decode("1", { width: 0 })).toThrow("must be a positive integer");
  });

  it("writes zero as 0, or as nothing without a zero digit, and reads both as no bytes", () => {
    expect(integer.encode(new Uint8Array())).toBe("0");
    expect(integer.encode(new Uint8Array([0, 0]))).toBe("0");
    expect(integer.encode(new Uint8Array(), { bijective: true })).toBe("");
    expect(integer.decode("000")).toEqual(new Uint8Array());
    expect(integer.decode("", { bijective: true })).toEqual(new Uint8Array());
  });

  it("reads a number wrapped over lines, and the default digits in either case", () => {
    expect(read(integer.decode(" 310939\n249775 "))).toBe("Hello");
    expect(integer.decode("FF", { radix: 16 })).toEqual(integer.decode("ff", { radix: 16 }));
    expect(() => integer.decode("ab", { digits: "AB" })).toThrow(
      'integer: "a" (U+0061) is not a digit in base 2',
    );
  });

  it("refuses digits outside the numeral with their index", () => {
    expect(() => integer.decode("12 3x", { radix: 8 })).toThrow(
      expect.objectContaining({ name: "DecodeError", encoding: "integer", index: 4 }),
    );
    expect(() => integer.decode("190", { radix: 9 })).toThrow(
      '"9" (U+0039) is not a digit in base 9',
    );
    expect(() => integer.decode("10", { bijective: true })).toThrow(
      '"0" (U+0030) is not a digit in bijective base 10',
    );
  });

  it("refuses a base or digits it cannot read", () => {
    expect(() => integer.encode(text("a"), { radix: 1 })).toThrow(
      "must be an integer from 2 to 36",
    );
    expect(() => integer.encode(text("a"), { radix: 37 })).toThrow("from 2 to 36");
    expect(() => integer.encode(text("a"), { radix: 36, bijective: true })).toThrow("from 2 to 35");
    expect(() => integer.encode(text("a"), { radix: 2.5 })).toThrow(InvalidOptionError);
    expect(() => integer.encode(text("a"), { digits: "aa" })).toThrow(
      "two or more different symbols",
    );
    expect(() => integer.encode(text("a"), { digits: "a" })).toThrow(
      "two or more different symbols",
    );
    expect(() => integer.encode(text("a"), { digits: "a b" })).toThrow(
      '" " (U+0020) is whitespace',
    );
    expect(() => integer.encode(text("a"), { digits: "01", radix: 3 })).toThrow(
      "digits has 2 symbols, so the base is 2",
    );
    expect(() => integer.encode(text("a"), { digits: 5 as never })).toThrow("must be a string");
  });

  it("round trips bytes in every base and in symbols past base 36", () => {
    const options = [
      ...Array.from({ length: 35 }, (_, step) => ({ radix: step + 2 })),
      ...Array.from({ length: 34 }, (_, step) => ({ radix: step + 2, bijective: true })),
      { digits: BASE62 },
      { digits: BASE62, bijective: true },
      { digits: "🌑🌒🌓🌔" },
    ];
    for (const [round, length] of [1, 2, 7, 33, 300].entries()) {
      const bytes = Uint8Array.from({ length }, (_, index) => (index * 131 + round * 17 + 1) & 255);
      bytes[0] = 1 + round;
      for (const each of options) {
        expect(integer.decode(integer.encode(bytes, each), each), JSON.stringify(each)).toEqual(
          bytes,
        );
      }
    }
  });
});

describe("hex", () => {
  it("writes either case and reads spaced, prefixed text", () => {
    expect(hex.encode(new Uint8Array([0xde, 0xad]), { upper: true })).toBe("DEAD");
    expect(hex.encode(hex.decode("0xDe Ad\nbe ef"))).toBe("deadbeef");
  });

  it("rejects an odd length and a non-digit with its index", () => {
    expect(() => hex.decode("abc")).toThrow("odd number of digits");
    expect(() => hex.decode("zz")).toThrow(DecodeError);
    expect(() => hex.decode("0g")).toThrow('"g" (U+0067) at index 1 is not a hex digit');
  });

  it("names a stray digit before an odd length, and points U+ at code points", () => {
    expect(() => hex.decode("0g1")).toThrow('"g" (U+0067) at index 1 is not a hex digit');
    expect(() => hex.decode("U+017C U+0061")).toThrow(
      '"U" (U+0055) at index 0 is not a hex digit; for Unicode code points, such as U+017C for ż, set codepoints',
    );
    expect(() => hex.decode("00 u+17c")).toThrow(expect.objectContaining({ index: 3 }));
    expect(() => hex.decode("00 u+17c")).toThrow(/set codepoints$/u);
    expect(() => hex.decode("0u")).toThrow(/is not a hex digit$/u);
    expect(hex.decode("017c")).toEqual(Uint8Array.of(0x01, 0x7c));
  });
});

describe("hex code points", () => {
  const codepoints = true;

  it("reads and writes the code points CPython gives", () => {
    expect(read(hex.decode(codePoints.hex, { codepoints }))).toBe(codePoints.text);
    expect(hex.encode(text(codePoints.text), { codepoints })).toBe(codePoints.hex);
  });

  it("takes U+ or not, any case, any number of digits, spaces and commas", () => {
    expect(read(hex.decode("u+5a,61  17C\n00000000017c", { codepoints }))).toBe("Zażż");
    expect(read(hex.decode("1f389 U+E9", { codepoints }))).toBe("🎉é");
    expect(hex.decode(" , ", { codepoints })).toEqual(new Uint8Array());
  });

  it("reads a number under 100 as a character, not a byte", () => {
    expect(hex.decode("e9", { codepoints })).toEqual(Uint8Array.of(0xc3, 0xa9));
    expect(hex.decode("e9")).toEqual(Uint8Array.of(0xe9));
  });

  it("always writes U+ and capitals, whatever upper says", () => {
    expect(hex.encode(text("ża"), { codepoints, upper: false })).toBe("U+017C U+0061");
    expect(hex.encode(text("ża"), { codepoints, upper: true })).toBe("U+017C U+0061");
  });

  it.each([
    [
      "the edges of each UTF-8 length",
      [0, 0x7f, 0x80, 0x7_ff, 0x8_00, 0xff_ff, 0x1_00_00, 0x10_ff_ff],
    ],
    ["the code points around the surrogates", [0xd7_ff, 0xe0_00]],
    ["a leading BOM", [0xfe_ff, 0x41]],
    [
      "line and paragraph separators and NBSP, last too",
      [0x61, 0x20_28, 0x62, 0x20_29, 0x63, 0xa0],
    ],
  ])("reads back %s", (_, points) => {
    const bytes = text(String.fromCodePoint(...points));
    expect(hex.decode(hex.encode(bytes, { codepoints }), { codepoints })).toEqual(bytes);
  });

  it("refuses what no text holds, with the index of the number", () => {
    expect(() => hex.decode("41 U+110000", { codepoints })).toThrow(
      expect.objectContaining({ message: 'hex: "U+110000" at index 3 is over U+10FFFF', index: 3 }),
    );
    expect(() => hex.decode("f".repeat(400), { codepoints })).toThrow("is over U+10FFFF");
    expect(() => hex.decode("41 d800", { codepoints })).toThrow(
      'hex: "d800" at index 3 is a surrogate, not a character',
    );
    expect(() => hex.decode("U+DFFF", { codepoints })).toThrow("is a surrogate");
  });

  it("points at the stray character inside a number, and at a bare U+", () => {
    expect(() => hex.decode("41 U+12x4", { codepoints })).toThrow(
      expect.objectContaining({
        message: 'hex: "x" (U+0078) at index 7 is not a hex digit',
        index: 7,
      }),
    );
    expect(() => hex.decode("U+41 0x41", { codepoints })).toThrow(
      expect.objectContaining({ index: 6 }),
    );
    expect(() => hex.decode("41 U+", { codepoints })).toThrow(
      expect.objectContaining({ message: 'hex: "U+" at index 3 has no digits', index: 3 }),
    );
    expect(() => hex.decode("U++41", { codepoints })).toThrow(
      expect.objectContaining({ index: 2 }),
    );
  });

  it("refuses bytes that are not UTF-8 and a codepoints that is not a boolean", () => {
    expect(() => hex.encode(Uint8Array.of(0xff), { codepoints })).toThrow(
      "hex: encode with codepoints takes UTF-8 text, and these bytes are not",
    );
    expect(() => hex.decode("41", { codepoints: "yes" as never })).toThrow(InvalidOptionError);
    expect(() => hex.encode(text("A"), { codepoints: 1 as never })).toThrow(InvalidOptionError);
  });
});

describe("binary", () => {
  it("writes eight bits per byte and reads them back", () => {
    expect(binary.encode(text("Hi"))).toBe("01001000 01101001");
    expect(binary.encode(text("Hi"), { separate: false })).toBe("0100100001101001");
    expect(read(binary.decode("0100100001101001"))).toBe("Hi");
  });

  it("rejects partial bytes and stray digits", () => {
    expect(() => binary.decode("0101")).toThrow("4 bits are not whole bytes");
    expect(() => binary.decode("01001002")).toThrow('"2" (U+0032) is not a bit');
  });

  it("reads the a and b of the GSMG.IO SalPhaseIon page", () => {
    const page =
      "a b b a b b a b a b b a a a a b a b b b a b a a a b b b a a b a a b b a b a a b a b b b b a a a a b b b a a b b a b b b a b a b a b b a b b a b a b b a b b a a a b b a b a a b a b b b a a b b a b b b a b a a";
    expect(read(binary.decode(page, { symbols: "ab" }))).toBe("matrixsumlist");
    expect(binary.encode(text("matrixsumlist"), { symbols: "ab", separate: false })).toBe(
      page.replaceAll(" ", ""),
    );
  });

  it("takes any two characters, emoji included", () => {
    expect(binary.encode(text("A"), { symbols: "10" })).toBe("10111110");
    expect(read(binary.decode("🌑🌕🌑🌑🌑🌑🌑🌕", { symbols: "🌑🌕" }))).toBe("A");
  });

  it("reads emoji with their variation selector, zero-width symbols and CR LF", () => {
    const suits = "♠️♥️♠️♠️♠️♠️♠️♥️\r\n♠️♥️♠️♠️♠️♠️♥️♠️";
    expect(read(binary.decode(suits, { symbols: "♠️♥️" }))).toBe("AB");
    expect(() => binary.decode("♠♥", { symbols: "♠️♥️" })).toThrow('"♠" (U+2660) is not a bit');
    expect(
      read(
        binary.decode("\u200C\u200D\u200C\u200C\u200C\u200C\u200C\u200D", {
          symbols: "\u200C\u200D",
        }),
      ),
    ).toBe("A");
    expect(() => binary.decode("0\u0301", { symbols: "01" })).toThrow(
      expect.objectContaining({ message: 'binary: "\u0301" (U+0301) is not a bit', index: 1 }),
    );
  });

  it("writes and reads fewer bits per byte and the least significant bit first", () => {
    expect(binary.encode(text("Hi"), { bits: 7 })).toBe("1001000 1101001");
    expect(binary.encode(text("Hi"), { order: "lsb" })).toBe("00010010 10010110");
    expect(binary.encode(text("Hi"), { bits: 7, order: "lsb" })).toBe("0001001 1001011");
    expect(read(binary.decode("10010001101001", { bits: 7 }))).toBe("Hi");
    expect(read(binary.decode("0001001 1001011", { bits: 7, order: "lsb" }))).toBe("Hi");
    expect(binary.decode("101", { bits: 1 })).toEqual(new Uint8Array([1, 0, 1]));
  });

  it("names the position in the text as given and the group size that failed", () => {
    expect(() => binary.decode("ab ac", { symbols: "ab" })).toThrow(
      expect.objectContaining({ index: 4 }),
    );
    expect(() => binary.decode("10010001", { bits: 7 })).toThrow(
      "8 bits are not whole groups of 7",
    );
  });

  it("refuses symbols, bit counts and bytes it cannot write", () => {
    for (const symbols of ["0", "aa", "abc", "a ", "\t1", "", `a${"\u0301".repeat(16)}b`]) {
      expect(() => binary.decode("0", { symbols })).toThrow(InvalidOptionError);
    }
    for (const bits of [0, 9, 7.5, Number.NaN]) {
      expect(() => binary.encode(text("A"), { bits })).toThrow(InvalidOptionError);
    }
    expect(() => binary.encode(text("é"), { bits: 7 })).toThrow(
      "byte 195 at index 0 needs more than 7 bits",
    );
    expect(() => binary.encode(text("é"), { bits: 7 })).toThrow(EncodingError);
  });
});

describe("base32 and base64 decoding rules", () => {
  it("reads lowercase base32 and unpadded or wrapped text", () => {
    expect(read(base32.decode("mzxw6ytboi"))).toBe("foobar");
    expect(read(base64.decode("Zm9v\r\nYmFy"))).toBe("foobar");
    expect(read(base64.decode("Zg"))).toBe("f");
    expect(read(base64.decode("Zg==", { alphabet: "url" }))).toBe("f");
  });

  it("writes and reads the URL alphabet only on request", () => {
    const bytes = new Uint8Array([0xfb, 0xff]);
    expect(base64.encode(bytes)).toBe("+/8=");
    expect(base64.encode(bytes, { alphabet: "url" })).toBe("-_8=");
    expect(base64.encode(bytes, { alphabet: "url", padding: false })).toBe("-_8");
    expect(base64.decode("-_8", { alphabet: "url" })).toEqual(bytes);
    expect(() => base64.decode("-_8")).toThrow('"-" (U+002D) at index 0 is not in the alphabet');
    expect(() => base64.decode("+/8", { alphabet: "url" })).toThrow("not in the alphabet");
  });

  it("reads the extended hex alphabet only on request", () => {
    expect(read(base32.decode("CO", { alphabet: "hex" }))).toBe("f");
    expect(read(base32.decode("MY"))).toBe("f");
    expect(base32.decode("CO")).not.toEqual(base32.decode("CO", { alphabet: "hex" }));
    expect(() => base32.decode("MY", { alphabet: "hex" })).toThrow('"Y" (U+0059) at index 1');
  });

  it("rejects wrong padding, data after padding and impossible lengths", () => {
    expect(() => base64.decode("Zg=")).toThrow("1 padding characters where the length needs 2");
    expect(() => base64.decode("Zg==Zg==")).toThrow("character after padding at index 4");
    expect(() => base64.decode("Z")).toThrow("do not end on a byte");
    expect(() => base32.decode("M")).toThrow("do not end on a byte");
    expect(() => base64.decode("Zm9v!")).toThrow('"!" (U+0021) at index 4 is not in the alphabet');
  });

  it("names a stray character before the padding it throws off", () => {
    expect(() => base64.decode("!AAA==")).toThrow('"!" (U+0021) at index 0 is not in the alphabet');
    expect(() => base32.decode("!AAAAAAA======")).toThrow(
      '"!" (U+0021) at index 0 is not in the alphabet',
    );
    expect(() => base64.decode("Zm\n9!==")).toThrow(expect.objectContaining({ index: 4 }));
    expect(() => base64.decode("Zg==!")).toThrow("character after padding at index 4");
  });

  it("reads non-zero leftover bits unless asked for the canonical form", () => {
    expect(base32.decode("MZ======")).toEqual(base32.decode("MY======"));
    expect(base64.decode("YR==")).toEqual(base64.decode("YQ=="));
    expect(read(base32.decode("MY======", { canonical: true }))).toBe("f");
    expect(read(base64.decode("YQ==", { canonical: true }))).toBe("a");
    expect(() => base32.decode("MZ======", { canonical: true })).toThrow(
      expect.objectContaining({ name: "DecodeError", encoding: "base32", index: 1 }),
    );
    expect(() => base64.decode("YR==", { canonical: true })).toThrow(
      '"R" (U+0052) at index 1 leaves non-zero bits after the last byte',
    );
  });

  it.each([
    [
      "base32 hex",
      "CO",
      "CP",
      (value: string, canonical: boolean) => base32.decode(value, { alphabet: "hex", canonical }),
    ],
    [
      "Crockford",
      "CR",
      "CS",
      (value: string, canonical: boolean) =>
        base32.decode(value, { alphabet: "crockford", canonical }),
    ],
    [
      "z-base-32",
      "ca",
      "c3",
      (value: string, canonical: boolean) => base32.decode(value, { alphabet: "z", canonical }),
    ],
    [
      "base64url",
      "-_8",
      "-_9",
      (value: string, canonical: boolean) => base64.decode(value, { alphabet: "url", canonical }),
    ],
  ] as const)("refuses %s leftover bits on request", (_, written, other, decode) => {
    expect(decode(other, false)).toEqual(decode(written, true));
    expect(() => decode(other, true)).toThrow("leaves non-zero bits after the last byte");
  });

  it("reads whole bytes and empty text as canonical", () => {
    expect(read(base32.decode("MZXW6YTBOI======", { canonical: true }))).toBe("foobar");
    expect(read(base64.decode("Zm9vYmFy", { canonical: true }))).toBe("foobar");
    expect(base64.decode("", { canonical: true })).toEqual(new Uint8Array());
  });

  it("reads Crockford's look-alikes and hyphens", () => {
    expect(base32crockford.decode("CSQPYRK1E8")).toEqual(base32crockford.decode("csqp-yrki-e8"));
    expect(base32crockford.decode("0O")).toEqual(base32crockford.decode("00"));
    expect(() => base32crockford.decode("UU")).toThrow("not in the alphabet");
  });

  it("writes base32 without padding on request", () => {
    expect(base32.encode(text("f"), { padding: true })).toBe("MY======");
    expect(base32.encode(text("f"), { padding: false })).toBe("MY");
    expect(base32.encode(text("f"), { alphabet: "hex", padding: false })).toBe("CO");
  });

  it("pads only the two RFC 4648 alphabets", () => {
    expect(base32.encode(text("f"), { alphabet: "crockford", padding: true })).toBe("CR");
    expect(base32.encode(text("f"), { alphabet: "z", padding: true })).toBe("ca");
    expect(base32.encode(text("f"), { alphabet: "hex" })).toBe("CO======");
  });

  it("round trips a Stellar account ID", () => {
    const strkey = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";
    const bytes = base32.decode(strkey);
    expect(bytes).toHaveLength(35);
    expect(bytes[0]).toBe(6 << 3);
    expect(crc16Xmodem(bytes.subarray(0, 33)).toReversed()).toEqual(bytes.subarray(33));
    expect(base32.encode(bytes, { padding: false })).toBe(strkey);
  });

  it("writes z-base-32 as its paper does", () => {
    expect(zbase32.encode(new Uint8Array([0xf0, 0xbf, 0xc7]))).toBe("6n9hq");
    expect(zbase32.encode(new Uint8Array([0xd4, 0x7a, 0x04]))).toBe("4t7ye");
  });
});

describe("base45 (RFC 9285 §4.3)", () => {
  it.each([
    ["AB", "BB8"],
    ["Hello!!", "%69 VD92EX0"],
    ["base-45", "UJCLQE7W581"],
    ["ietf!", "QED8WEX0"],
  ])("%s ↔ %s", (input, encoded) => {
    expect(base45.encode(text(input))).toBe(encoded);
    expect(read(base45.decode(encoded))).toBe(input);
  });

  it("rejects values over the byte range and a lone character", () => {
    expect(() => base45.decode("GGW")).toThrow("over 65535");
    expect(() => base45.decode("ZZ")).toThrow("over 255");
    expect(() => base45.decode("BB8A")).toThrow("leave one without a pair");
  });
});

describe("base58", () => {
  it("keeps leading zero bytes as leading ones", () => {
    expect(base58.encode(hex.decode("0000287fb4cd"))).toBe("11233QC4");
    expect(hex.encode(base58.decode("11233QC4"))).toBe("0000287fb4cd");
    expect(base58.encode(new Uint8Array(3))).toBe("111");
  });

  it("rejects characters outside the alphabet, such as 0 and l", () => {
    expect(() => base58.decode("10")).toThrow('"0" (U+0030) at index 1 is not in the alphabet');
    expect(() => base58.decode("l")).toThrow("not in the alphabet");
  });
});

describe("base58 with check", () => {
  it("reads the genesis block address and writes it back", () => {
    const payload = base58check.decode("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa");
    expect(hex.encode(payload)).toBe("0062e907b15cbf27d5425399ebf6f0fb50ebb88f18");
    expect(base58check.encode(payload)).toBe("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa");
  });

  it("reads a WIF key with its version and compression bytes", () => {
    const payload = base58check.decode("KwDiBf89QgGbjEhKnhXJuH7LrciVrZi3qYjgd9M7rFU73sVHnoWn");
    expect(hex.encode(payload)).toBe(
      "800000000000000000000000000000000000000000000000000000000000000001" + "01",
    );
  });

  it("names a checksum mismatch and a text too short for one", () => {
    expect(() => base58check.decode("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb")).toThrow(ChecksumError);
    expect(() => base58check.decode("1")).toThrow("leave no room for a checksum");
    expect(() => base58check.decode("0")).toThrow(/^base58: "0"/u);
  });

  it("refuses an alphabet it does not have, even one named like an Object member", () => {
    const odd = { alphabet: "toString" } as unknown as Base58Options;
    expect(() => base58.encode(new Uint8Array(1), odd)).toThrow(
      "Invalid option alphabet=toString: use one of bitcoin, flickr, ripple",
    );
  });
});

describe("createBase58", () => {
  it("reads and writes what base58 does in each alphabet", () => {
    const bytes = hex.decode("0000287fb4cd");
    for (const alphabet of ["bitcoin", "flickr", "ripple"] as const) {
      const written = base58.encode(bytes, { alphabet });
      expect(createBase58(alphabet).encode(bytes)).toBe(written);
      expect(createBase58(alphabet).decode(written)).toEqual(bytes);
    }
    expect(createBase58().encode(bytes)).toBe("11233QC4");
  });

  it("checks no checksum, so a Base58Check string reads back whole", () => {
    expect(createBase58().decode("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb")).toHaveLength(25);
  });

  it("hands out a codec of its own, so patching it leaves base58 alone", () => {
    const codec = createBase58();
    codec.decode = () => new Uint8Array(1);
    expect(base58.decode("11233QC4")).toHaveLength(6);
    expect(createBase58().decode("11233QC4")).toHaveLength(6);
  });

  it("names its errors base58 and refuses an alphabet it does not have", () => {
    expect(() => createBase58().decode("10")).toThrow('base58: "0" (U+0030) at index 1');
    const odd = "toString" as unknown as "bitcoin";
    expect(() => createBase58(odd)).toThrow(
      "Invalid option alphabet=toString: use one of bitcoin, flickr, ripple",
    );
  });
});

describe("createBase58check", () => {
  const RIPPLE = "rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz";
  const decred = createBase58check(blake256);
  const ripple = createBase58check(sha256, RIPPLE);

  it("reads a Decred address, whose checksum is double BLAKE-256", () => {
    const address = "DsUZxxoHJSty8DCfwfartwTYbuhmVct7tJu";
    expect(() => base58check.decode(address)).toThrow(ChecksumError);
    const payload = decred.decode(address);
    expect(hex.encode(payload)).toBe("073f2789d58cfa0957d206f025c2af056fc8a77cebb0");
    expect(decred.encode(payload)).toBe(address);
  });

  it("checks an XRP Ledger address in the Ripple alphabet", () => {
    const payload = ripple.decode("rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh");
    expect(hex.encode(payload)).toBe("00b5f762798a53d543a014caf8b297cff8f2f937e8");
    expect(base58ripple.decode("rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTi")).toHaveLength(25);
    expect(() => ripple.decode("rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTi")).toThrow(ChecksumError);
    const options = { alphabet: "ripple", check: true } as const;
    expect(base58.decode("rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh", options)).toEqual(payload);
    expect(base58.encode(payload, options)).toBe("rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh");
  });

  it("matches @scure/base and @noble/hashes", () => {
    for (const row of base58checkVariants) {
      const bytes = hex.decode(row["hex"]!);
      expect(decred.encode(bytes)).toBe(row["blake256"]);
      expect(ripple.encode(bytes)).toBe(row["ripple"]);
      expect(decred.decode(row["blake256"]!)).toEqual(bytes);
      expect(ripple.decode(row["ripple"]!)).toEqual(bytes);
    }
  });

  it("gives what Bitcoin's base58check gives for SHA-256", () => {
    const wif = "KwDiBf89QgGbjEhKnhXJuH7LrciVrZi3qYjgd9M7rFU73sVHnoWn";
    expect(createBase58check(sha256).decode(wif)).toEqual(base58check.decode(wif));
  });

  it("names its errors base58check, with the index of a bad character", () => {
    expect(() => ripple.decode("r0")).toThrow('base58check: "0" (U+0030) at index 1');
    expect(() => decred.decode("1")).toThrow("leave no room for a checksum");
  });

  it("refuses an alphabet that is not 58 distinct characters, and a hash under 4 bytes", () => {
    expect(() => createBase58check(sha256, RIPPLE.slice(1))).toThrow(InvalidOptionError);
    expect(() => createBase58check(sha256, `${RIPPLE.slice(1)}p`)).toThrow(
      "needs 58 distinct characters",
    );
    expect(() => createBase58check(sha256, `${RIPPLE.slice(1)}\u{1F600}`)).toThrow(
      InvalidOptionError,
    );
    const short = createBase58check((bytes) => sha256(bytes).subarray(0, 3));
    expect(() => short.encode(new Uint8Array(1))).toThrow("must return at least 4 bytes");
  });
});

describe("base58 with blocks", () => {
  /* The Monero General Fund address, a 0x12 network byte, two keys and a Keccak checksum. */
  const FUND =
    "44AFFq5kSiGBoZ4NMDwYtN18obc8AemS33DBLWs3H7otXft3XjrpDtQGv7SqSsaBYBb98uNbr2VBBEt7f2wfn3RVGQBEP3A";

  it("reads a real Monero address whose Keccak checksum then matches", () => {
    const bytes = base58blocks.decode(FUND);
    expect(bytes).toHaveLength(69);
    expect(bytes[0]).toBe(0x12);
    expect(bytes.subarray(65)).toEqual(keccak256(bytes.subarray(0, 65)).subarray(0, 4));
    expect(base58blocks.encode(bytes)).toBe(FUND);
  });

  it("writes the length from the byte count alone", () => {
    expect(base58blocks.encode(new Uint8Array(69))).toBe("1".repeat(95));
    expect(hex.encode(base58blocks.decode("1".repeat(95)))).toBe("00".repeat(69));
    expect(base58.encode(new Uint8Array(2), { blocks: true, alphabet: "ripple" })).toBe("rrr");
  });

  it("refuses an overflowing block and a last block no byte count writes", () => {
    expect(() => base58blocks.decode("jpXCZedGfVR")).toThrow(
      "base58: the block at index 0 overflows its 8 bytes",
    );
    expect(() => base58blocks.decode("11111111111zz")).toThrow("block at index 11 overflows");
    for (const text of ["1", "1111", "1111111111111111111"]) {
      expect(() => base58blocks.decode(text), text).toThrow("no byte count writes a last block");
    }
  });

  it("points at a bad character in the whole text, not in its block", () => {
    expect(() => base58blocks.decode("11111111111110")).toThrow(
      expect.objectContaining({
        message: 'base58: "0" (U+0030) at index 13 is not in the alphabet',
        index: 13,
      }),
    );
    expect(() => base58blocks.decode("1111111111\u{1F600}")).toThrow(
      expect.objectContaining({
        message: 'base58: "\u{1F600}" (U+1F600) at index 10 is not in the alphabet',
        index: 10,
      }),
    );
  });

  it("sums the payload with check before cutting it into blocks", () => {
    const options = { blocks: true, check: true } as const;
    const written = base58.encode(text("monero"), options);
    expect(written).toHaveLength(14);
    expect(base58.decode(written, options)).toEqual(text("monero"));
  });
});

describe("Ascii85 and Z85", () => {
  it("writes Ascii85 with z for zero groups, and reads Adobe's delimiters", () => {
    expect(ascii85.encode(text("Hello, World!"))).toBe("87cURD_*#4DfTZ)+T");
    expect(ascii85.encode(new Uint8Array(4), { delimiters: true })).toBe("<~z~>");
    expect(read(ascii85.decode("<~87cURD_*#4DfTZ)+T~>"))).toBe("Hello, World!");
    expect(read(ascii85.decode("87cUR D_*#4\nDfTZ)+T"))).toBe("Hello, World!");
  });

  it("rejects z inside a group and an unclosed <~", () => {
    expect(() => ascii85.decode("8z")).toThrow('"z" at index 1 inside a group');
    expect(() => ascii85.decode("<~87cUR")).toThrow("without a closing");
    expect(() => ascii85.decode("uuuuu")).toThrow("over 2^32 - 1");
  });

  it("writes the ZeroMQ RFC 32 example and refuses partial groups", () => {
    expect(z85.encode(hex.decode("864FD26FB559F75B"))).toBe("HelloWorld");
    expect(() => z85.encode(new Uint8Array(3))).toThrow("not a multiple of 4");
    expect(() => z85.encode(new Uint8Array(3))).toThrow(EncodingError);
    expect(() => z85.decode("Hello")).not.toThrow();
    expect(() => z85.decode("Hell")).toThrow("not a multiple of 5");
  });
});

describe("base85 (RFC 1924 alphabet)", () => {
  it("reads and writes the vector Python's b85encode gives for hello world", () => {
    expect(base85.encode(text("hello world"))).toBe("Xk~0{Zy<MXa%^M");
    expect(read(base85.decode("Xk~0{Zy<MXa%^M"))).toBe("hello world");
  });

  it("rejects characters outside the alphabet, a group of one and overflow", () => {
    expect(() => base85.decode("Xk~0 ")).toThrow('" " (U+0020) at index 4 is not in the alphabet');
    expect(() => base85.decode("Xk~0{Z")).toThrow("leave a group of one");
    expect(() => base85.decode("~~~~~")).toThrow("over 2^32 - 1");
  });
});

describe("basE91", () => {
  it("writes the reference implementation's output", () => {
    expect(base91.encode(text("Hello, World!"))).toBe(">OwJh>}AQ;r@@Y?F");
    expect(read(base91.decode(">OwJh>}AQ;r@@Y?F"))).toBe("Hello, World!");
  });

  it("rejects characters outside the alphabet instead of skipping them", () => {
    expect(() => base91.decode("ab-c")).toThrow('"-" (U+002D) at index 2 is not in the alphabet');
  });
});

describe("base256", () => {
  it("writes and reads the multibase example of issue 10", () => {
    expect(base256.encode(text("gsmg"), { multibase: true })).toBe("🚀😝🌈🌷😝");
    expect(read(base256.decode("🚀😝🌈🌷😝", { multibase: true }))).toBe("gsmg");
    expect(hex.encode(base256.decode("🚀😝🌈🌷😝"))).toBe("0067736d67");
    expect(() => base256.decode("😝🌈🌷😝", { multibase: true })).toThrow(
      'base256: text does not start with "🚀" (U+1F680)',
    );
  });

  it("skips whitespace and emoji presentation selectors", () => {
    expect(base256.decode("☄\uFE0F ☄\n☄\uFE0E")).toEqual(new Uint8Array([2, 2, 2]));
  });

  it("reads a table of fewer symbols as digits", () => {
    expect(base256.decode("♠ ♥️ ♦ ♣ ♣", { symbols: "♠ ♥ ♦ ♣" })).toEqual(
      new Uint8Array([0, 1, 2, 3, 3]),
    );
    expect(base256.encode(new Uint8Array([3, 0]), { symbols: "♠♥♦♣" })).toBe("♣♠");
    expect(() => base256.encode(new Uint8Array([4]), { symbols: "♠♥♦♣" })).toThrow(
      "byte 4 at index 0 is past the table of 4 symbols",
    );
  });

  it("orders the table by first appearance in a sample", () => {
    expect(base256.decode("ᚦᚠᚢ", { sample: "ᚠᚢᚠ ᚦᚢ" })).toEqual(new Uint8Array([2, 0, 1]));
  });

  it("keeps flags and joined emoji whole and zero-width characters apart", () => {
    expect(base256.decode("🇩🇪🇵🇱", { symbols: "🇵🇱🇩🇪" })).toEqual(new Uint8Array([1, 0]));
    expect(base256.decode("👍👨‍👩‍👧", { symbols: "👨‍👩‍👧👍" })).toEqual(new Uint8Array([1, 0]));
    const zeroWidth = "\u200B\u200C\u200D\u2060";
    expect(base256.decode("\u2060\u200D\u200C\u200B", { symbols: zeroWidth })).toEqual(
      new Uint8Array([3, 2, 1, 0]),
    );
  });

  it("names the stray symbol and where it is", () => {
    expect(() => base256.decode("🚀a")).toThrow(
      expect.objectContaining({ message: 'base256: "a" (U+0061) is not in the table', index: 2 }),
    );
  });

  it("reads symbols the text ran into one grapheme back apart", () => {
    const symbols = "🇩🇪 🇵 🇱";
    const text = base256.encode(new Uint8Array([1, 2, 0]), { symbols });
    expect(text).toBe("🇵🇱🇩🇪");
    expect(base256.decode(text, { symbols })).toEqual(new Uint8Array([1, 2, 0]));
  });

  it("refuses to write symbols that read back as another symbol", () => {
    const symbols = "🇵 🇱 🇵🇱";
    expect(() => base256.encode(new Uint8Array([0, 1]), { symbols })).toThrow(
      "base256: the symbols from index 0 run together and read back as other bytes",
    );
    expect(base256.encode(new Uint8Array([2, 0]), { symbols })).toBe("🇵🇱🇵");
    expect(base256.decode("🇵🇱", { symbols })).toEqual(new Uint8Array([2]));
  });

  it("keeps a mark after a space separator a symbol of its own", () => {
    expect(base256.encode(new Uint8Array([1, 0]), { symbols: "a \u0301" })).toBe("\u0301a");
  });

  it("refuses a symbol over 16 code points and shows a long value by its length", () => {
    const sample = `a${"\u0301".repeat(20_000)}b`;
    expect(() => base256.decode("b", { sample })).toThrow(
      "Invalid option sample=20002 characters: has a symbol over 16 code points",
    );
  });

  it("names a huge grapheme by its first code point only", () => {
    const error = (() => {
      try {
        base256.decode(`a${"\u0301".repeat(100_000)}`, { symbols: "🇩🇪 b" });
      } catch (caught) {
        return caught as Error;
      }
      return new Error("no error");
    })();
    expect(error.message).toBe('base256: "a" (U+0061) is not in the table');
  });

  it("quotes a symbol of several code points whole in errors", () => {
    expect(() => base256.decode("x", { symbols: "a\u0301 a\u0301" })).toThrow('repeats "a\u0301"');
    expect(() => base256.decode("🇵🇱", { symbols: "🇩🇪🇫🇷" })).toThrow('"🇵🇱" is not in the table');
  });

  it("refuses tables it cannot read", () => {
    for (const symbols of ["a", "aa", "a a", ""]) {
      expect(() => base256.decode("a", { symbols })).toThrow(InvalidOptionError);
    }
    expect(() => base256.decode("a", { symbols: "ab", sample: "ab" })).toThrow(InvalidOptionError);
    expect(() => base256.decode("a", { symbols: "ab", multibase: true })).toThrow(
      "goes with the emoji alphabet only",
    );
  });
});

describe("bech32 and bech32m (BIP173, BIP350)", () => {
  it.each([
    "A12UEL5L",
    "a12uel5l",
    "an83characterlonghumanreadablepartthatcontainsthenumber1andtheexcludedcharactersbio1tt5tgs",
    "abcdef1qpzry9x8gf2tvdw0s3jn54khce6mua7lmqqqxw",
    "split1checkupstagehandshakeupstreamerranterredcaperred2y9e3w",
  ])("accepts the valid bech32 %s", (value) => {
    expect(() => bech32.decodeWords(value)).not.toThrow();
  });

  it.each(["a1lqfn3a", "A1LQFN3A", "abcdef1l7aum6echk45nj3s0wdvt2fg8x9yrzpqzd3ryx", "?1v759aa"])(
    "accepts the valid bech32m %s",
    (value) => {
      expect(() => bech32m.decodeWords(value)).not.toThrow();
    },
  );

  it.each([
    "pzry9x0s0muk",
    "1pzry9x0s0muk",
    "x1b4n0q5v",
    "li1dgmt3",
    "A1G7SGD8",
    "10a06t8",
    "1qzzfhee",
    "a12UEL5L",
  ])("rejects the invalid bech32 %s", (value) => {
    expect(() => bech32.decodeWords(value)).toThrow(DecodeError);
  });

  it("tells a checksum of the other variant apart", () => {
    expect(() => bech32.decodeWords("a1lqfn3a")).toThrow("checksum is bech32m's");
    expect(() => bech32m.decodeWords("a12uel5l")).toThrow("checksum is bech32's");
  });

  it("writes and reads bytes under a prefix", () => {
    const encoded = bech32.encode("test", text("hi"));
    expect(bech32.decode(encoded)).toEqual({ prefix: "test", bytes: text("hi") });
  });

  it("refuses a result over the limit unless the limit is raised", () => {
    const long = new Uint8Array(60);
    expect(() => bech32.encode("lnbc", long)).toThrow("Invalid option limit=90");
    expect(bech32.decode(bech32.encode("lnbc", long, 200), 200).bytes).toEqual(long);
  });
});

describe("bech32 words", () => {
  const program = hex.decode("751e76e8199196d454941c45d1b3a323f1433bd6");
  const address = bech32.decodeWords("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4");

  it("regroups a witness program into the words after the version (BIP173)", () => {
    expect(toWords(program)).toEqual(address.words.slice(1));
    expect(fromWords(address.words.slice(1))).toEqual(program);
    expect(fromWordsUnsafe(address.words.slice(1))).toEqual(program);
  });

  it("pads a partial last word with zero bits", () => {
    expect(toWords(Uint8Array.of(0xff))).toEqual([31, 28]);
    expect(fromWords([31, 28])).toEqual(Uint8Array.of(0xff));
    expect(toWords(new Uint8Array(0))).toEqual([]);
  });

  it.each([
    ["one word, five bits short of a byte", [0], "5 bits are left over, and padding is at most 4"],
    ["padding bits that are not zero", [31, 29], "padding bits after the last byte are not zero"],
    ["a word over 31", [0, 32], "word 32 at index 1 is not an integer from 0 to 31"],
    ["a negative word", [-1, 0], "word -1 at index 0 is not an integer from 0 to 31"],
    ["a fractional word", [0, 1.5], "word 1.5 at index 1 is not an integer from 0 to 31"],
  ])("refuses %s", (_, words, message) => {
    expect(() => fromWords(words)).toThrow(DecodeError);
    expect(() => fromWords(words)).toThrow(`bech32: ${message}`);
    expect(fromWordsUnsafe(words)).toBeUndefined();
  });

  it("names the offending word's index", () => {
    expect(() => fromWords([0, 32])).toThrow(expect.objectContaining({ index: 1 }));
  });
});

describe("segwit addresses", () => {
  it.each([
    ["BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4", 0, "751e76e8199196d454941c45d1b3a323f1433bd6"],
    [
      "tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7",
      0,
      "1863143c14c5166804bd19203356da136c985678cd4d27a1b8c6329604903262",
    ],
    [
      "bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0",
      1,
      "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
    ],
  ] as const)("reads %s", (address, version, program) => {
    const decoded = segwit.decode(address);
    expect(decoded.version).toBe(version);
    expect(hex.encode(decoded.program)).toBe(program);
    expect(segwit.encode(decoded.prefix, version, decoded.program)).toBe(address.toLowerCase());
  });

  it("reads a version 2 address with a 16-byte program (BIP350)", () => {
    const decoded = segwit.decode("bc1zw508d6qejxtdg4y5r3zarvaryvaxxpcs");
    expect(decoded.version).toBe(2);
    expect(hex.encode(decoded.program)).toBe("751e76e8199196d454941c45d1b3a323");
  });

  it.each([
    [
      "version 1 under the bech32 checksum",
      () => bech32.encodeWords("bc", [1, ...toWords(new Uint8Array(32))]),
    ],
    [
      "version 0 under the bech32m checksum",
      () => bech32m.encodeWords("bc", [0, ...toWords(new Uint8Array(20))]),
    ],
    [
      "a 21-byte version 0 program",
      () => bech32.encodeWords("bc", [0, ...toWords(new Uint8Array(21))]),
    ],
    ["a 41-byte program", () => bech32m.encodeWords("bc", [1, ...toWords(new Uint8Array(41))])],
    ["version 17", () => bech32m.encodeWords("bc", [17, ...toWords(new Uint8Array(20))])],
  ] as const)("rejects %s", (_, build) => {
    expect(() => segwit.decode(build())).toThrow(DecodeError);
  });
});

describe("uuencode", () => {
  it("writes a begin line, one length-led line per 45 bytes and the end", () => {
    expect(uuencode.encode(text("Cat"), { name: "cat.txt" })).toBe(
      "begin 644 cat.txt\n#0V%T\n`\nend\n",
    );
    expect(uuencode.encode(new Uint8Array(46)).split("\n")).toHaveLength(6);
  });

  it("reads with or without the frame and refuses begin-base64", () => {
    expect(read(uuencode.decode("begin 644 cat.txt\r\n#0V%T\r\n`\r\nend\r\n"))).toBe("Cat");
    expect(read(uuencode.decode("#0V%T"))).toBe("Cat");
    expect(() => uuencode.decode("begin-base64 644 x\nQ2F0\n====\n")).toThrow("is base64");
    expect(() => uuencode.decode("begin 644 x\n#0V%T\n")).toThrow('no "end" line');
  });

  it("rejects a line shorter than it announces and a bad mode", () => {
    expect(() => uuencode.decode("M0V%T")).toThrow("announces 45 bytes");
    expect(() => uuencode.encode(text("x"), { mode: "9" })).toThrow("octal digits");
    expect(() => uuencode.encode(text("x"), { name: "a\nb" })).toThrow("one non-empty line");
  });
});

describe("quoted-printable (RFC 2045 §6.7)", () => {
  it("escapes = and non-ASCII and keeps a trailing space visible", () => {
    expect(quotedPrintable.encode(text("café = ok \nend"))).toBe("caf=C3=A9 =3D ok=20\nend");
    expect(read(quotedPrintable.decode("caf=c3=a9 =3D ok=20\nend"))).toBe("café = ok \nend");
  });

  it("breaks lines over 76 characters with a soft break it reads back", () => {
    const long = "x".repeat(200);
    const encoded = quotedPrintable.encode(text(long));
    expect(encoded.split("\n").every((line) => line.length <= 76)).toBe(true);
    expect(read(quotedPrintable.decode(encoded))).toBe(long);
  });

  it("keeps CRLF and drops whitespace before a line end", () => {
    expect(read(quotedPrintable.decode("a  \r\nb=\r\nc"))).toBe("a\r\nbc");
  });

  it("rejects a broken escape", () => {
    expect(() => quotedPrintable.decode("a=4")).toThrow("not followed by two hex digits");
    expect(() => quotedPrintable.decode("a=ZZ")).toThrow("not followed by two hex digits");
  });
});

describe("html (WHATWG character references)", () => {
  it("reads named, decimal and hex references, and leaves a bare & alone", () => {
    expect(read(html.decode("Universit&auml;t &lt;b&gt; &#65;&#x42; R&D"))).toBe(
      "Universität <b> AB R&D",
    );
  });

  it.each(Object.entries(whatwg))("reads %j as entities 8.1.0 does", (input, expected) => {
    expect(read(html.decode(input))).toBe(expected);
  });

  it("takes an upper case X and any number of leading zeros", () => {
    expect(read(html.decode("&#X41;&#x0042;&#0067;"))).toBe("ABC");
  });

  it("reads 0x80 to 0x9F through Windows-1252, the way the pages meant them", () => {
    expect(read(html.decode("&#145;quoted&#146; &#150; &#128;5"))).toBe("‘quoted’ – €5");
    expect(read(html.decode("&#x8D;"))).toBe("\u008D");
  });

  it("knows every name in the WHATWG table, with and without its semicolon", () => {
    expect(read(html.decode("&CounterClockwiseContourIntegral; &bne; &frac34 &yuml"))).toBe(
      "∳ =\u20E5 ¾ ÿ",
    );
    expect(read(html.decode("&frac34x"))).toBe("¾x");
  });

  it("escapes the five markup characters and keeps the rest", () => {
    expect(html.encode(text(`Tom & "Jerry" <b>'s</b> café`))).toBe(
      "Tom &amp; &quot;Jerry&quot; &lt;b&gt;&#39;s&lt;/b&gt; café",
    );
  });

  it("writes everything past ASCII as hex references with ascii", () => {
    expect(html.encode(text("café 😀 <"), { ascii: true })).toBe("caf&#xE9; &#x1F600; &lt;");
  });

  it("refuses with ascii a C1 control that HTML would read back as something else", () => {
    expect(() => html.encode(text("\u0085"), { ascii: true })).toThrow(
      `html: U+0085 has no reference that reads back as itself; HTML reads &#x85; as "…" (U+2026)`,
    );
    expect(html.encode(text("\u0085"))).toBe("\u0085");
    expect(read(html.decode(html.encode(text("\u0081"), { ascii: true })))).toBe("\u0081");
  });

  it("round trips text, and bytes that open with a byte order mark", () => {
    const sample = "a&b <c> \"d\" 'e' &amp; 😀 \u0000";
    for (const ascii of [false, true]) {
      expect(read(html.decode(html.encode(text(sample), { ascii })))).toBe(sample);
    }
    expect(html.decode(html.encode(Uint8Array.of(0xef, 0xbb, 0xbf)))).toEqual(
      Uint8Array.of(0xef, 0xbb, 0xbf),
    );
  });

  it("refuses bytes that are not UTF-8, since a reference names a character", () => {
    expect(() => html.encode(Uint8Array.of(0xff))).toThrow(EncodingError);
    expect(() => html.encode(Uint8Array.of(0xff))).toThrow("html: encode takes UTF-8 text");
  });
});

describe("ita2", () => {
  const LTRS = "11111";
  const FIGS = "11011";
  /* ITU-T S.1 (03/93) Table 1: letters, figures, elements 1 to 5, Z as 1, quotes in ASCII. */
  const S1 = [
    ["A", "-", "ZZAAA"],
    ["B", "?", "ZAAZZ"],
    ["C", ":", "AZZZA"],
    ["D", "\u0005", "ZAAZA"],
    ["E", "3", "ZAAAA"],
    ["F", undefined, "ZAZZA"],
    ["G", undefined, "AZAZZ"],
    ["H", undefined, "AAZAZ"],
    ["I", "8", "AZZAA"],
    ["J", "\u0007", "ZZAZA"],
    ["K", "(", "ZZZZA"],
    ["L", ")", "AZAAZ"],
    ["M", ".", "AAZZZ"],
    ["N", ",", "AAZZA"],
    ["O", "9", "AAAZZ"],
    ["P", "0", "AZZAZ"],
    ["Q", "1", "ZZZAZ"],
    ["R", "4", "AZAZA"],
    ["S", "'", "ZAZAA"],
    ["T", "5", "AAAAZ"],
    ["U", "7", "ZZZAA"],
    ["V", "=", "AZZZZ"],
    ["W", "2", "ZZAAZ"],
    ["X", "/", "ZAZZZ"],
    ["Y", "6", "ZAZAZ"],
    ["Z", "+", "ZAAAZ"],
    ["\r", "\r", "AAAZA"],
    ["\n", "\n", "AZAAA"],
    [" ", " ", "AAZAA"],
    ["\0", "\0", "AAAAA"],
  ] as const;
  /* Figures where US-TTY differs from ITA2, from Gil Smith's Teletypewriter Communication Codes. */
  const US_TTY: Readonly<Record<string, string>> = {
    D: "$",
    F: "!",
    G: "&",
    H: "#",
    J: "'",
    S: "\u0007",
    V: ";",
    Z: '"',
  };
  /* CCITT-1 as telexforum.de tabulates ITA1: letters, figures, elements 1 to 5. */
  const ITA1 = [
    ["A", "1", "10000"],
    ["E", "2", "01000"],
    ["\r", "\r", "11000"],
    ["Y", "3", "00100"],
    ["U", "4", "10100"],
    ["I", undefined, "01100"],
    ["O", "5", "11100"],
    ["J", "6", "10010"],
    ["G", "7", "01010"],
    ["H", "+", "11010"],
    ["B", "8", "00110"],
    ["C", "9", "10110"],
    ["F", undefined, "01110"],
    ["D", "0", "11110"],
    ["\n", "\n", "10001"],
    ["X", ",", "01001"],
    ["Z", ":", "11001"],
    ["S", ".", "00101"],
    ["T", undefined, "10101"],
    ["W", "?", "01101"],
    ["V", "'", "11101"],
    ["\u007F", "\u007F", "00011"],
    ["K", "(", "10011"],
    ["M", ")", "01011"],
    ["L", "=", "11011"],
    ["R", "-", "00111"],
    ["Q", "/", "10111"],
    ["N", undefined, "01111"],
    ["P", "%", "11111"],
  ] as const;
  const lsb = { order: "lsb" } as const;

  it("reads every combination of ITU-T S.1 Table 1 in both cases", () => {
    expect(S1).toHaveLength(30);
    for (const [letter, figure, elements] of S1) {
      const bits = elements.replaceAll("Z", "1").replaceAll("A", "0");
      expect(read(ita2.decode(bits, lsb)), elements).toBe(letter);
      expect(ita2.encode(text(letter), lsb), elements).toBe(bits);
      const figures = `${FIGS} ${bits}`;
      if (figure === undefined) {
        expect(() => ita2.decode(figures, lsb), elements).toThrow("means nothing among figures");
      } else {
        expect(read(ita2.decode(figures, lsb)), elements).toBe(figure);
      }
    }
    expect(read(ita2.decode(`${FIGS} 11000 ${LTRS} 11000`, lsb))).toBe("-A");
  });

  it("swaps the eight figures US-TTY changes and keeps the rest", () => {
    for (const [letter, figure, elements] of S1.slice(0, 26)) {
      const figures = `${FIGS} ${elements.replaceAll("Z", "1").replaceAll("A", "0")}`;
      const expected = US_TTY[letter] ?? figure;
      expect(read(ita2.decode(figures, { ...lsb, alphabet: "us-tty" })), letter).toBe(expected);
    }
  });

  it("reads every code of CCITT-1, with the shifts that double as space", () => {
    for (const [letter, figure, bits] of ITA1) {
      const options = { ...lsb, alphabet: "ita1" } as const;
      expect(read(ita2.decode(bits, options)), bits).toBe(letter);
      const figures = `00010 ${bits}`;
      if (figure === undefined) {
        expect(() => ita2.decode(figures, options), bits).toThrow("means nothing among figures");
      } else {
        expect(read(ita2.decode(figures, options)), bits).toBe(figure);
      }
    }
    const options = { ...lsb, alphabet: "ita1" } as const;
    expect(read(ita2.decode("10000 00001 00010 10000 00010 00001 10000", options))).toBe("A 1 A");
    expect(ita2.encode(text("A 1 A"), options)).toBe("10000 00001 00010 10000 00010 00001 10000");
    expect(() => ita2.decode("00000", options)).toThrow("code 0 at index 0 means nothing");
  });

  it("writes HELLO in each table, element 5 first unless told otherwise", () => {
    const hello = {
      ita2: "10100 00001 10010 10010 11000",
      "us-tty": "10100 00001 10010 10010 11000",
      ita1: "01011 00010 11011 11011 00111",
    } as const;
    for (const [alphabet, bits] of Object.entries(hello)) {
      const options = { alphabet: alphabet as keyof typeof hello };
      expect(ita2.encode(text("HELLO"), options), alphabet).toBe(bits);
      expect(read(ita2.decode(bits, options)), alphabet).toBe("HELLO");
      const reversed = bits.replaceAll(/\d{5}/gu, (group) => Array.from(group).reverse().join(""));
      expect(ita2.encode(text("HELLO"), { ...options, order: "lsb" }), alphabet).toBe(reversed);
      expect(read(ita2.decode(reversed, { ...options, order: "lsb" })), alphabet).toBe("HELLO");
    }
  });

  it("puts one figures shift between A and 1, and none before A", () => {
    expect(ita2.encode(text("A1"))).toBe(`00011 ${FIGS} 10111`);
    expect(ita2.encode(text("A1"), { numbers: true })).toBe("3 27 23");
    expect(ita2.encode(text("1 A"))).toBe(`${FIGS} 10111 00100 ${LTRS} 00011`);
  });

  it("reads the same five bits as + in ITA2 and as a quote in US-TTY", () => {
    expect(read(ita2.decode(`${FIGS} 10001`))).toBe("+");
    expect(read(ita2.decode(`${FIGS} 10001`, { alphabet: "us-tty" }))).toBe('"');
    expect(read(ita2.decode(`${FIGS} 00101`, { alphabet: "us-tty" }))).toBe("\u0007");
  });

  it("matches python-baudot, which opens with a shift", () => {
    for (const [alphabet, rows] of Object.entries(baudot)) {
      const options = { alphabet: alphabet as keyof typeof baudot, numbers: true };
      for (const { text: plain, codes } of rows) {
        expect(read(ita2.decode(codes, options)), plain).toBe(plain);
        expect(ita2.encode(text(plain), options), plain).toBe(codes.replace(/^31 /u, ""));
      }
    }
  });

  it("round-trips random letters and figures in each table", () => {
    const pools = {
      ita2: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-?:().,'=/+ \r\n\0\u0005\u0007",
      "us-tty": "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-?:().,'/$!&#;\" \r\n\0\u0007",
      ita1: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+,:.?'()=-/% \r\n\u007F",
    } as const;
    let seed = 7;
    const next = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed;
    };
    for (const [alphabet, pool] of Object.entries(pools)) {
      const characters = Array.from(pool);
      for (let round = 0; round < 50; round++) {
        const plain = Array.from(
          { length: 1 + (next() % 40) },
          () => characters[next() % characters.length]!,
        ).join("");
        for (const options of [{}, { order: "lsb" }, { numbers: true }] as const) {
          const all = { ...options, alphabet: alphabet as keyof typeof pools };
          expect(read(ita2.decode(ita2.encode(text(plain), all), all)), JSON.stringify(plain)).toBe(
            plain,
          );
        }
      }
    }
  });

  it("reads numbers split by spaces or commas, and bits wrapped by whitespace", () => {
    expect(read(ita2.decode("20,1, 18 18\n24", { numbers: true }))).toBe("HELLO");
    expect(read(ita2.decode("1010000001\n10010 1001011000"))).toBe("HELLO");
    expect(ita2.encode(text("HI"), { separate: false })).toBe("1010000110");
  });

  it("names the code, the case and the place of a code with no meaning", () => {
    expect(() => ita2.decode(`00011 ${FIGS} 01101`)).toThrow(
      "ita2: code 13 at index 12 means nothing among figures in ita2",
    );
    expect(() => ita2.decode("3 27 13", { numbers: true })).toThrow(
      expect.objectContaining({ name: "DecodeError", index: 5 }),
    );
    expect(read(ita2.decode(`${FIGS} 01101`, { alphabet: "us-tty" }))).toBe("!");
  });

  it("refuses broken bits, numbers out of range and text it cannot write", () => {
    expect(() => ita2.decode("0101")).toThrow("4 bits are not whole groups of 5");
    expect(() => ita2.decode("01012")).toThrow(
      expect.objectContaining({ name: "DecodeError", index: 4 }),
    );
    expect(() => ita2.decode("3 32", { numbers: true })).toThrow(
      "ita2: the number at index 2 is over 31",
    );
    expect(() => ita2.decode("9".repeat(100_000), { numbers: true })).toThrow(
      /^ita2: the number at index 0 is over 31$/u,
    );
    expect(() => ita2.decode("3 -1", { numbers: true })).toThrow('"-" (U+002D) is not a digit');
    expect(() => ita2.decode("3 12x", { numbers: true })).toThrow(
      expect.objectContaining({ name: "DecodeError", index: 4 }),
    );
    expect(() => ita2.encode(text("Hi"))).toThrow(
      'ita2: "i" (U+0069) at index 1 has no code in ita2; teleprinters print capitals only',
    );
    expect(() => ita2.encode(text("A%"))).toThrow('"%" (U+0025) at index 1 has no code in ita2');
    expect(() => ita2.encode(text("﻿A"))).toThrow("U+FEFF at index 0 has no code");
    expect(() => ita2.encode(Uint8Array.of(0xff))).toThrow("ita2: encode takes UTF-8 text");
    expect(() => ita2.encode(text("A"), { alphabet: "ita3" as never })).toThrow(InvalidOptionError);
    expect(() => ita2.decode("00011", { order: "middle" as never })).toThrow(InvalidOptionError);
    expect(() => ita2.decode("00011", { numbers: "yes" as never })).toThrow(InvalidOptionError);
  });
});

describe("charsets", () => {
  const all = Uint8Array.from({ length: 256 }, (_, index) => index);

  it.each(Object.entries(codePages))("%s reads every byte as glibc iconv does", (page, utf8) => {
    const codepage = page as (typeof CODE_PAGES)[number];
    expect(charsets.toText(all, { codepage })).toBe(read(hex.decode(utf8)));
  });

  it("reads Windows-1252 as the WHATWG Encoding Standard does, and Latin-1 byte for byte", () => {
    expect(charsets.toText(all, { codepage: "windows1252" })).toBe(
      new TextDecoder("windows-1252").decode(all),
    );
    expect(charsets.toText(all, { codepage: "latin1" })).toBe(
      String.fromCodePoint(...Array.from(all)),
    );
  });

  it.each(CODE_PAGES)("%s gives each byte its own character and reads it back", (codepage) => {
    const table = charsets.toText(all, { codepage });
    expect(new Set(table).size).toBe(256);
    expect(charsets.fromText(table, { codepage })).toEqual(all);
  });

  it("writes GSMG phase 3.2.1 in IBM 1141 and 273 as its letters", () => {
    for (const codepage of ["ibm1141", "ibm273"] as const) {
      expect(read(charsets.fromText(gsmg.shown, { codepage }))).toBe(gsmg.letters);
    }
  });

  it("puts the euro sign on 0x9F of 1140 and 1141 only", () => {
    const at = (codepage: (typeof CODE_PAGES)[number]) =>
      charsets.toText(Uint8Array.of(0x9f), { codepage });
    expect([at("ibm037"), at("ibm1140"), at("ibm273"), at("ibm1141")]).toEqual([
      "¤",
      "€",
      "¤",
      "€",
    ]);
    expect(charsets.fromText("€", { codepage: "ibm1141" })).toEqual(Uint8Array.of(0x9f));
  });

  it("reads a DOS ZIP name in 437 and keeps its low bytes ASCII", () => {
    const name = hex.decode("434146902e545854");
    expect(charsets.toText(name, { codepage: "ibm437" })).toBe("CAFÉ.TXT");
    expect(charsets.fromText("╔═╗ ½", { codepage: "ibm437" })).toEqual(
      Uint8Array.of(0xc9, 0xcd, 0xbb, 0x20, 0xab),
    );
    expect(() => charsets.fromText("☺", { codepage: "ibm437" })).toThrow(
      'ibm437: "☺" (U+263A) at index 0 has no byte',
    );
  });

  it("names a character the code page lacks, and a code page that is not one", () => {
    expect(() => charsets.fromText("a€b", { codepage: "ibm037" })).toThrow(DecodeError);
    expect(() => charsets.fromText("a€b", { codepage: "ibm037" })).toThrow(
      'ibm037: "€" (U+20AC) at index 1 has no byte',
    );
    expect(() => charsets.fromText("😀x", { codepage: "latin1" })).toThrow(
      '"😀" (U+1F600) at index 0',
    );
    const codepage = "cp037" as (typeof CODE_PAGES)[number];
    expect(() => charsets.toText(all, { codepage })).toThrow(InvalidOptionError);
    expect(() => charsets.toText(all, { codepage: "constructor" as typeof codepage })).toThrow(
      "use one of ibm037",
    );
    expect(() => charsets.toText(all, {} as never)).toThrow(
      "Option codepage is missing: use one of ibm037",
    );
  });
});

describe("rlp", () => {
  /* The input ethereum/tests describes, as rlp.encode takes it. */
  const input = (vector: RlpVector): RlpInput =>
    typeof vector === "string"
      ? text(vector)
      : typeof vector === "bigint"
        ? vector
        : vector.map(input);

  /* What decoding gives back: integers as their big-endian bytes, zero as no bytes. */
  const item = (vector: RlpVector): RlpItem => {
    if (typeof vector === "string") return text(vector);
    if (typeof vector !== "bigint") return vector.map(item);
    const digits = vector === 0n ? "" : vector.toString(16);
    return hex.decode(digits.length % 2 === 0 ? digits : `0${digits}`);
  };

  /* A list nested `depth` deep around one byte string. */
  const nested = (depth: number): RlpInput => {
    let list: RlpInput = text("x");
    for (let level = 0; level < depth; level++) list = [list];
    return list;
  };

  it.each(rlpValid)("%s encodes and decodes as ethereum/tests says", (_, vector, encoded) => {
    expect(hex.encode(rlp.encode(input(vector)))).toBe(encoded);
    expect(rlp.decode(hex.decode(encoded))).toEqual(item(vector));
  });

  it.each(rlpInvalid)("%s is refused", (_, encoded) => {
    expect(() => rlp.decode(hex.decode(encoded))).toThrow(DecodeError);
  });

  it("points at the byte that breaks the canonical form", () => {
    const at = (encoded: string) => {
      try {
        rlp.decode(hex.decode(encoded));
      } catch (error) {
        return [(error as DecodeError).index, (error as Error).message];
      }
      return [];
    };
    expect(at("c28100")).toEqual([1, "rlp: header at index 1 wraps a single byte under 0x80"]);
    expect(at("c2b800")).toEqual([2, "rlp: length at index 2 starts with a zero byte"]);
    expect(at("f80180")).toEqual([0, "rlp: length 1 at index 0 belongs in the short form"]);
    expect(at("c0c0")).toEqual([1, "rlp: extra bytes from index 1 after the item"]);
    expect(at("c2820102")).toEqual([1, "rlp: length 2 at index 1 runs 1 past the end"]);
    expect(at("b9")).toEqual([0, "rlp: header at index 0 needs 2 length bytes"]);
    expect(at("bfffffffffffffffff")).toEqual([
      0,
      "rlp: length 18446744073709551615 at index 0 runs 18446744073709551615 past the end",
    ]);
    expect(at("")).toEqual([undefined, "rlp: no item in an empty input"]);
  });

  it("keeps a list's items inside it", () => {
    expect(() => rlp.decode(hex.decode("c2c20000"))).toThrow(
      "length 2 at index 1 runs 1 past the end",
    );
    expect(rlp.decode(hex.decode("c3c20000"))).toEqual([[Uint8Array.of(0), Uint8Array.of(0)]]);
  });

  it("nests a hundred thousand lists without running out of stack", () => {
    const encoded = rlp.encode(nested(100_000));
    expect(rlp.encode(rlp.decode(encoded))).toEqual(encoded);
  });

  it("writes a list that appears twice the same both times", () => {
    const pair = [text("a"), 1n];
    expect(hex.encode(rlp.encode([pair, pair]))).toBe("c6c26101c26101");
  });

  it("takes bytes from another realm and refuses an output larger than memory", () => {
    expect(hex.encode(rlp.encode([runInNewContext("new Uint8Array([0x80])") as Uint8Array]))).toBe(
      "c28180",
    );
    let shared: RlpInput = [Uint8Array.of(1, 2, 3, 4)];
    for (let level = 0; level < 40; level++) shared = [shared, shared];
    expect(() => rlp.encode(shared)).toThrow("more than fits in memory");
    for (let level = 40; level < 1100; level++) shared = [shared, shared];
    expect(() => rlp.encode(shared)).toThrow("over 9007199254740991 bytes");
  });

  it.each([
    ["a Uint8Array", hex.decode("c3826162")],
    ["a Buffer", Buffer.from("c3826162", "hex")],
  ])("copies the bytes out of %s", (_, encoded) => {
    const [decoded] = rlp.decode(encoded) as Uint8Array[];
    encoded[2] = 0;
    expect(decoded).toEqual(text("ab"));
  });

  /* The two mainnet transactions of agntn/keys#270: each digest recovers the listed `from`. */
  it.each([
    [
      "legacy with EIP-155",
      "f8a980850649534e0082cb32946b175474e89094c44da98b954eedeac495271d0f80b844a9059cbb000000000000000000000000d8d8bc3bb68ec59a8491af4257522dfe4f0b94120000000000000000000000000000000000000000000000056bc75e2d6310000026a06c4de940075ed7c67661cc141747c80bffdd5a48d0a9c49fedc95ff53270a72ca034f8ce13d98c42ff8af4e93f399aa20e44988973c1b0ae24d3c9bfbb4ef7ba81",
      6,
      [1n, 0n, 0n],
      "464935fd6a513df7a77f031ce2b4e0e4b14e3675832b16ccd18274e05b28c35d",
    ],
    [
      "type 2",
      "02f87301068405f5e100850299e45aba82520894f755aaace22fcfdcd4e300a3f26249000d95f1b28803b4860307b3664f80c080a03945159237a25c17a158194a90cf98a8cac028616751fc9b318a9aa2cdfd2beea05195431bd190114cb0562ca747c5784b0833369520916ee35ba8d2a78147d662",
      9,
      [],
      "9b5cfa17969993d9a389747871fd5a80e82d829b276fa8245492806182b84ea6",
    ],
  ] as const)("rebuilds the signing digest of a %s transaction", (_, raw, kept, tail, digest) => {
    const bytes = hex.decode(raw);
    const typed = bytes[0] === 2;
    const body = typed ? bytes.subarray(1) : bytes;
    const fields = rlp.decode(body) as RlpItem[];
    expect(rlp.encode(fields)).toEqual(body);
    const unsigned = rlp.encode([...fields.slice(0, kept), ...tail]);
    expect(hex.encode(keccak256(typed ? Uint8Array.of(2, ...unsigned) : unsigned))).toBe(digest);
  });

  it("refuses what has no encoding", () => {
    const cycle: RlpInput[] = [];
    cycle.push(cycle);
    expect(() => rlp.encode([cycle])).toThrow("rlp: a list contains itself");
    expect(() => rlp.encode(-1n)).toThrow("rlp: -1 is negative");
    expect(() => rlp.encode(7 as unknown as bigint)).toThrow(EncodingError);
    expect(() => rlp.encode(["dog"] as unknown as RlpInput)).toThrow("cannot encode a string");
  });
});

describe("armor (RFC 9580 §6)", () => {
  /* RFC 9580 A.2: the sample Ed25519Legacy signature packet, printed in hex and in armor. */
  const signature = hex.decode(
    "885e040016080006050255f95f95000a09108cfde12197965a9af62200ff56f90cca98e2102637bd983fdb16c131dfd27ed82bf4dde5606e0d756aed33660100d09c4fa11527f038e0f57f2201d82f2ea2c9033265fa6ceb489e854bae61b404",
  );
  const signatureArmor = [
    "-----BEGIN PGP SIGNATURE-----",
    "",
    "iF4EABYIAAYFAlX5X5UACgkQjP3hIZeWWpr2IgD/VvkMypjiECY3vZg/2xbBMd/S",
    "ftgr9N3lYG4NdWrtM2YBANCcT6EVJ/A44PV/IgHYLy6iyQMyZfps60iehUuuYbQE",
    "-----END PGP SIGNATURE-----",
  ].join("\n");

  it("writes and reads the RFC 9580 sample signature", () => {
    expect(armor.encode(signature, { label: "SIGNATURE" })).toBe(signatureArmor);
    expect(armor.decode(signatureArmor)).toEqual({
      label: "SIGNATURE",
      headers: [],
      bytes: signature,
      checksum: "absent",
    });
  });

  it("reads the RFC 9580 sample key as the RFC prints it, indented", () => {
    /* The RFC prints this packet in hex with an old format header, 98, but its armor holds c6. */
    const block = armor.decode(
      [
        "   -----BEGIN PGP PUBLIC KEY BLOCK-----",
        "",
        "   xjMEU/NfCxYJKwYBBAHaRw8BAQdAPwmJlL3ZFu1AUxl5NOSofIBzOhKA1i+AEJku",
        "   Q+47JAY=",
        "   -----END PGP PUBLIC KEY BLOCK-----",
      ].join("\r\n"),
    );
    expect(block.label).toBe("PUBLIC KEY BLOCK");
    expect(hex.encode(block.bytes)).toBe(
      "c6330453f35f0b16092b06010401da470f010107403f098994bdd916ed4053197934e4a87c80733a1280d62f8010992e43ee3b2406",
    );
  });

  it("reads and writes what gpg --enarmor writes, header and CRC24 included", () => {
    const comment = ["Comment", 'Use "gpg --dearmor" for unpacking'] as const;
    expect(armor.decode(gnupg.armored)).toEqual({
      label: "ARMORED FILE",
      headers: [comment],
      bytes: hex.decode(gnupg.hex),
      checksum: "match",
    });
    const written = armor.encode(hex.decode(gnupg.hex), {
      label: "ARMORED FILE",
      headers: [comment],
      checksum: true,
    });
    expect(`${written}\n`).toBe(gnupg.armored);
  });

  it("reports a wrong or broken CRC24 instead of throwing", () => {
    const bytes = hex.decode(gnupg.hex);
    expect(armor.decode(gnupg.armored.replace("=z6pb", "=z6pc"))).toMatchObject({
      bytes,
      checksum: "mismatch",
    });
    expect(armor.decode(gnupg.armored.replace("=z6pb", "=!?"))).toMatchObject({
      bytes,
      checksum: "mismatch",
    });
  });

  it("round trips any label, empty data and repeated or empty headers", () => {
    const headers = [
      ["Comment", "first"],
      ["Comment", "second: with a colon"],
      ["Charset", ""],
    ] as const;
    for (const bytes of [new Uint8Array(), Uint8Array.from({ length: 200 }, (_, i) => i)]) {
      const written = armor.encode(bytes, { label: "MESSAGE, PART 1/2", headers, checksum: true });
      expect(armor.decode(written)).toEqual({
        label: "MESSAGE, PART 1/2",
        headers,
        bytes,
        checksum: "match",
      });
    }
  });

  it("wraps the base64 at 64 characters", () => {
    const lines = armor.encode(new Uint8Array(100), { label: "MESSAGE" }).split("\n");
    expect(lines.slice(2, -1).map((line) => line.length)).toEqual([64, 64, 8]);
  });

  it("reads a block whose blank line after the headers got lost", () => {
    const squeezed = gnupg.armored.replace("unpacking\n\n", "unpacking\n");
    expect(armor.decode(squeezed)).toEqual(armor.decode(gnupg.armored));
  });

  it("reads a header with no space after its colon", () => {
    const tight = gnupg.armored.replace("Comment: Use", "Comment:Use");
    expect(armor.decode(tight).headers).toEqual([["Comment", 'Use "gpg --dearmor" for unpacking']]);
  });

  it.each(["one two", "one two", "ends in a line separator ", "nbsp "])(
    "keeps the Unicode in header value %j",
    (value) => {
      const block = armor.encode(signature, { label: "SIGNATURE", headers: [["Comment", value]] });
      expect(armor.decode(block).headers).toEqual([["Comment", value]]);
    },
  );

  it("skips blank lines and spaces inside the data and under the checksum", () => {
    const loose = signatureArmor.replace("Wpr2", "Wpr 2").replace("/S\n", "/S\n\n  \n");
    expect(armor.decode(loose).bytes).toEqual(signature);
    const spaced = gnupg.armored.replace("=z6pb\n", "=z6pb\n\n");
    expect(armor.decode(spaced).checksum).toBe("match");
  });

  it("finds the block inside other text and stops at its END line", () => {
    const mail = `Hi,\n\nhere it is:\n\n${signatureArmor}\n\n-- \nsent from a phone\n`;
    expect(armor.decode(mail).bytes).toEqual(signature);
  });

  it("reads only the label asked for", () => {
    const key = armor.encode(text("key"), { label: "PUBLIC KEY BLOCK" });
    const both = `${key}\n${signatureArmor}`;
    expect(armor.decode(both).label).toBe("PUBLIC KEY BLOCK");
    expect(armor.decode(both, { label: "SIGNATURE" }).bytes).toEqual(signature);
    expect(() => armor.decode(key, { label: "SIGNATURE" })).toThrow(
      "armor: no -----BEGIN PGP SIGNATURE----- line, only PUBLIC KEY BLOCK",
    );
  });

  it("steps over a cleartext signed message to its signature", () => {
    const message = [
      "-----BEGIN PGP SIGNED MESSAGE-----",
      "Hash: SHA256",
      "",
      "OpenPGP",
      signatureArmor,
    ].join("\n");
    expect(armor.decode(message)).toMatchObject({ label: "SIGNATURE", bytes: signature });
    expect(() => armor.decode(message, { label: "SIGNED MESSAGE" })).toThrow(InvalidOptionError);
  });

  it.each([
    ["no block at all", "just text", "armor: no -----BEGIN PGP ...----- line"],
    [
      "no END line",
      signatureArmor.replace("-----END PGP SIGNATURE-----", ""),
      "armor: no -----END PGP SIGNATURE----- line after the data",
    ],
    [
      "an END line for another label",
      signatureArmor.replace("END PGP SIGNATURE", "END PGP MESSAGE"),
      "armor: expected -----END PGP SIGNATURE-----, found -----END PGP MESSAGE-----",
    ],
    [
      "a stray dashed line too long to quote",
      signatureArmor.replace("/S\n", `/S\n-----${"x".repeat(100_000)}\n`),
      "armor: expected -----END PGP SIGNATURE-----, found a line of 100005 characters",
    ],
    [
      "data after the checksum",
      signatureArmor.replace("/S\n", "/S\n=abcd\n"),
      "armor: the checksum line must sit right above -----END PGP SIGNATURE-----",
    ],
    [
      "data that is not base64",
      signatureArmor.replace("Wpr2", "Wpr!"),
      'armor: the data is not base64: "!" (U+0021)',
    ],
  ])("refuses %s", (_, armored, message) => {
    expect(() => armor.decode(armored)).toThrow(DecodeError);
    expect(() => armor.decode(armored)).toThrow(message);
  });

  it.each([
    ["a lowercase label", { label: "message" }, "label"],
    ["a label with PGP in it", { label: "PGP MESSAGE" }, "label"],
    ["a label ending in a space", { label: "MESSAGE " }, "label"],
    ["the cleartext frame", { label: "SIGNED MESSAGE" }, "label"],
    ["a header name with a colon", { label: "MESSAGE", headers: [["A:B", "c"]] }, "headers"],
    ["a header name with a space", { label: "MESSAGE", headers: [["A B", "c"]] }, "headers"],
    ["a header value over two lines", { label: "MESSAGE", headers: [["A", "b\nc"]] }, "headers"],
    ["a header value ending in a space", { label: "MESSAGE", headers: [["A", "b "]] }, "headers"],
    ["headers that are no list", { label: "MESSAGE", headers: { A: "b" } }, "headers"],
    ["a header that is a string", { label: "MESSAGE", headers: ["AB"] }, "headers"],
    ["a header that is a number", { label: "MESSAGE", headers: [5] }, "headers"],
    ["a header that is undefined", { label: "MESSAGE", headers: [undefined] }, "headers"],
    [
      "a header with a hole for it",
      { label: "MESSAGE", headers: Object.assign([], { length: 1 }) },
      "headers",
    ],
    ["a header of one part", { label: "MESSAGE", headers: [["A"]] }, "headers"],
    ["a header of three parts", { label: "MESSAGE", headers: [["A", "b", "c"]] }, "headers"],
    ["a header as a set", { label: "MESSAGE", headers: [new Set(["A", "b"])] }, "headers"],
    ["a checksum that is no boolean", { label: "MESSAGE", checksum: "yes" }, "checksum"],
  ])("refuses to write %s", (_, options, option) => {
    const write = () => armor.encode(signature, options as never);
    expect(write).toThrow(InvalidOptionError);
    expect(write).toThrow(`Invalid option ${option}=`);
  });

  it("names a missing label instead of showing it as undefined", () => {
    expect(() => armor.encode(signature, {} as never)).toThrow(
      "Option label is missing: a label is what follows BEGIN PGP",
    );
  });

  it("keeps a header given with an undefined part invalid, not missing", () => {
    for (const header of [
      ["A", undefined],
      [undefined, "b"],
    ]) {
      const write = () => armor.encode(signature, { label: "MESSAGE", headers: [header] } as never);
      expect(write).toThrow("Invalid option headers=undefined");
    }
  });

  it("still names the option when the value can't even become text", () => {
    for (const options of [
      { label: Object.create(null) as unknown },
      { label: "MESSAGE", headers: Object.create(null) as unknown },
      { label: "MESSAGE", headers: [Object.create(null) as unknown] },
    ]) {
      const write = () => armor.encode(signature, options as never);
      expect(write).toThrow(InvalidOptionError);
      expect(write).toThrow("=a value with no text form: ");
    }
  });

  it("refuses input of the wrong type from a caller without types", () => {
    expect(() => armor.encode("abc" as never, { label: "MESSAGE" })).toThrow(
      "armor: encode takes bytes, got string",
    );
    expect(() => armor.encode(signature, undefined as never)).toThrow(InvalidOptionError);
    expect(() => armor.decode(null as never)).toThrow("armor: decode takes text, got null");
    expect(() => armor.decode(signatureArmor, { label: 7 } as never)).toThrow(InvalidOptionError);
  });
});

describe("input of the wrong type", () => {
  const codecs = [
    ["binary", binary],
    ["octal", octal],
    ["decimal", decimal],
    ["integer", integer],
    ["hex", hex],
    ["base32", base32],
    ["base45", base45],
    ["base58", base58],
    ["base58", createBase58("flickr")],
    ["base58check", createBase58check(blake256)],
    ["base64", base64],
    ["base85", base85],
    ["base91", base91],
    ["base256", base256],
    ["uuencode", uuencode],
    ["quoted-printable", quotedPrintable],
    ["html", html],
    ["ita2", ita2],
    ["prefix", prefix],
  ] as const;

  it.each(codecs)("%s refuses a string to encode instead of writing zeros", (name, codec) => {
    expect(() => codec.encode("abc" as never)).toThrow(EncodingError);
    expect(() => codec.encode("abc" as never)).toThrow(
      `${name}: encode takes bytes, got string; turn the string into bytes first`,
    );
    expect(() => codec.encode(null as never)).toThrow(`${name}: encode takes bytes, got null`);
    expect(() => codec.encode([97] as never)).toThrow(`${name}: encode takes bytes, got array`);
  });

  it.each(codecs)("%s refuses anything but text to decode", (name, codec) => {
    expect(() => codec.decode(null as never)).toThrow(EncodingError);
    expect(() => codec.decode(null as never)).toThrow(`${name}: decode takes text, got null`);
    expect(() => codec.decode(5 as never)).toThrow(`${name}: decode takes text, got number`);
  });

  it("checks before every option of base58 and the base58check factory", () => {
    for (const options of [{ check: true }, { blocks: true }, { blocks: true, check: true }]) {
      expect(() => base58.encode("abc" as never, options)).toThrow("base58: encode takes bytes");
      expect(() => base58.decode(null as never, options)).toThrow("base58: decode takes text");
    }
  });

  it("refuses the wrong type in the codecs with more than one argument", () => {
    expect(() => bech32.encode("bc", "abc" as never)).toThrow("bech32: encode takes bytes");
    expect(() => bech32m.decode(null as never)).toThrow("bech32m: decode takes text, got null");
    expect(() => bech32.encode(5 as never, text("a"))).toThrow(InvalidOptionError);
    expect(() => toWords("abc" as never)).toThrow("bech32: toWords takes bytes, got string");
    expect(() => segwit.encode("bc", 0, "abc" as never)).toThrow("segwit: encode takes bytes");
    expect(() => segwit.decode(undefined as never)).toThrow(
      "segwit: decode takes text, got undefined",
    );
    expect(() => charsets.toText("abc" as never, { codepage: "latin1" })).toThrow(
      "charsets: toText takes bytes, got string",
    );
    expect(() => charsets.fromText(null as never, { codepage: "latin1" })).toThrow(
      "charsets: fromText takes text, got null",
    );
    expect(() => rlp.decode("c3826162" as never)).toThrow("rlp: decode takes bytes, got string");
  });

  it("still takes a Buffer and bytes from another realm", () => {
    expect(base64.encode(Buffer.from("abc"))).toBe("YWJj");
    expect(hex.encode(runInNewContext("new Uint8Array([1, 2])") as Uint8Array)).toBe("0102");
  });
});

describe("round trips over every byte value", () => {
  const all = Uint8Array.from({ length: 256 }, (_, index) => index);
  it.each([
    ["binary", binary],
    ["octal", octal],
    ["decimal", decimal],
    ["hex", hex],
    ["base32", base32],
    ["base32hex", base32hex],
    ["base32-crockford", base32crockford],
    ["z-base-32", zbase32],
    ["base45", base45],
    ["base58", base58],
    ["base58check", base58check],
    ["base64", base64],
    ["base64url", base64url],
    ["ascii85", ascii85],
    ["z85", z85],
    ["base85", base85],
    ["base91", base91],
    ["base256", base256],
    ["uuencode", uuencode],
    ["quoted-printable", quotedPrintable],
  ] as const)("%s", (_, codec) => {
    expect(codec.decode(codec.encode(all))).toEqual(all);
  });
});

describe("decode error index", () => {
  /* Each text wraps or frames its bad character, and the number is where the caller sees it. */
  it.each([
    ["base64 wrapped by MIME", () => base64.decode("YWJj\nZG*l"), 7],
    ["base64 after padding", () => base64.decode("Zg==\n Zg=="), 6],
    ["Crockford with hyphens", () => base32crockford.decode("AB-CD-!"), 6],
    ["hex with 0x and spaces", () => hex.decode("0x00 11 2g"), 9],
    ["Ascii85 inside <~ ~>", () => ascii85.decode(" <~87cU{~>"), 7],
    ["Ascii85 z after <~", () => ascii85.decode("<~8 z~>"), 4],
    [
      "base64 leftover bits after a line break",
      () => base64.decode("Y\nR==", { canonical: true }),
      2,
    ],
  ] as const)("%s", (_, decode, index) => {
    expect(decode).toThrow(expect.objectContaining({ name: "DecodeError", index }));
    expect(decode).toThrow(new RegExp(`at index ${index}\\b`, "u"));
  });

  it("keeps the index of text with nothing to skip", () => {
    expect(() => base64.decode("YWJjZG*l")).toThrow(expect.objectContaining({ index: 6 }));
    expect(() => hex.decode("00112g")).toThrow(expect.objectContaining({ index: 5 }));
  });
});

describe("hostile input", () => {
  const LS = String.fromCodePoint(0x2028);
  const RLO = String.fromCodePoint(0x202e);

  it("names an invisible or line-breaking character by code point only", () => {
    expect(() => base64.decode(`ab${LS}c`)).toThrow("U+2028 at index 2 is not in the alphabet");
    expect(() => base64.decode(`ab${RLO}c`)).toThrow("U+202E at index 2 is not in the alphabet");
    for (const character of [LS, RLO]) {
      try {
        base64.decode(`ab${character}c`);
      } catch (error) {
        expect((error as Error).message).not.toContain(character);
      }
    }
  });

  it("reads a numeric reference with a million zeros without parsing them", () => {
    expect(read(html.decode(`&#${"0".repeat(1_000_000)}65;`))).toBe("A");
  });

  it("decodes a quoted-printable line too long to spread into one call", () => {
    expect(quotedPrintable.decode("a".repeat(500_000))).toHaveLength(500_000);
  });
});

describe("large input", () => {
  it("encodes 1 MB in a 24 MB heap, where appending per character runs out", () => {
    const script = `
      import { Buffer } from "node:buffer";
      import * as lib from "./src/index.ts";
      const bytes = new Uint8Array(1_000_000).map((_, index) => (index * 131 + 7) & 255);
      const outputs = {
        base64: lib.base64.encode(bytes),
        base64url: lib.base64.encode(bytes, { alphabet: "url", padding: false }),
        base32: lib.base32.encode(bytes),
        hex: lib.hex.encode(bytes),
        base45: lib.base45.encode(bytes),
        base85: lib.base85.encode(bytes),
        base91: lib.base91.encode(bytes),
        uuencode: lib.uuencode.encode(bytes),
        quotedPrintable: lib.quotedPrintable.encode(bytes),
        latin1: lib.charsets.toText(bytes, { codepage: "latin1" }),
      };
      const buffer = Buffer.from(bytes);
      const lengths = Object.fromEntries(
        Object.entries(outputs).map(([name, text]) => [name, text.length]),
      );
      const matches = [
        outputs.base64 === buffer.toString("base64"),
        outputs.base64url === buffer.toString("base64url"),
        outputs.hex === buffer.toString("hex"),
        outputs.latin1 === buffer.toString("latin1"),
      ];
      console.log(JSON.stringify({ lengths, matches }));
    `;
    const { status, stdout, stderr } = spawnSync(
      process.execPath,
      ["--max-old-space-size=24", "--input-type=module", "-e", script],
      { cwd: join(import.meta.dirname, ".."), encoding: "utf8" },
    );
    expect(stderr).not.toContain("heap out of memory");
    expect(status).toBe(0);
    const { lengths, matches } = JSON.parse(stdout) as {
      lengths: Record<string, number>;
      matches: boolean[];
    };
    expect(matches).toEqual([true, true, true, true]);
    expect(lengths).toMatchObject({
      base64: 1_333_336,
      base32: 1_600_000,
      hex: 2_000_000,
      base45: 1_500_000,
      base85: 1_250_000,
      latin1: 1_000_000,
    });
  }, 30_000);
});

describe("prefix", () => {
  const book = { A: "0", B: "10", C: "110", D: "111" };
  const decoded = (bits: string, options: Parameters<typeof prefix.decode>[1]) => {
    const result = prefix.decode(bits, options);
    return { text: read(result.bytes), kraft: result.kraft, leftover: result.leftover };
  };

  it.each(prefixCodes)("agrees with bitarray on $text", ({ codebook, text: plain, bits }) => {
    expect(prefix.encode(text(plain), { codebook })).toBe(bits);
    expect(decoded(bits, { codebook })).toEqual({ text: plain, kraft: "1", leftover: "" });
  });

  it("reads and writes bits with a codebook, as an object or as text", () => {
    expect(decoded("010110111", { codebook: book })).toEqual({
      text: "ABCD",
      kraft: "1",
      leftover: "",
    });
    expect(prefix.encode(text("ABCD"), { codebook: "A=0 B:10, C=110 D=111" })).toBe("010110111");
    expect(prefix.encode(text("DAB"), { codebook: book, separate: true })).toBe("111 0 10");
    expect(
      read(prefix.decode("0 11\n10", { codebook: '{" ":"0","=":"10","😀":"11"}' }).bytes),
    ).toBe(" 😀=");
  });

  /* Wikipedia, Truncated binary encoding: n = 10 keeps six codewords at 3 bits, four at 4. */
  it("builds truncated binary for n symbols", () => {
    expect(Object.values(prefix.codebook({ code: "truncated", n: 5 }))).toEqual([
      "00",
      "01",
      "10",
      "110",
      "111",
    ]);
    expect(prefix.codebook({ code: "truncated", n: 10 })).toMatchObject({
      "5": "101",
      "6": "1100",
      "9": "1111",
    });
    expect(Object.values(prefix.codebook({ code: "truncated", n: 8 }))).toEqual(
      Array.from({ length: 8 }, (_, value) => value.toString(2).padStart(3, "0")),
    );
  });

  /* Elias (1975), the gamma code: 1, 010, 011, 00100 and on; unary as n ones and a zero. */
  it("writes unary and Elias gamma", () => {
    expect(prefix.encode(text("1 2 3 4 17"), { code: "gamma", separate: true })).toBe(
      "1 010 011 00100 000010001",
    );
    expect(decoded("101001100100000010001", { code: "gamma" })).toEqual({
      text: "1 2 3 4 17",
      kraft: "1",
      leftover: "",
    });
    expect(prefix.encode(text("0, 1 2 5"), { code: "unary" })).toBe("010110111110");
    expect(read(prefix.decode("010110111110", { code: "unary" }).bytes)).toBe("0 1 2 5");
    expect(
      read(
        prefix.decode(prefix.encode(text("4 0 3"), { code: "truncated", n: 5 }), {
          code: "truncated",
          n: 5,
        }).bytes,
      ),
    ).toBe("4 0 3");
  });

  it("survives a round trip of random symbols in every code", () => {
    let seed = 7;
    const next = (below: number) => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed % below;
    };
    for (let round = 0; round < 300; round++) {
      const n = 2 + next(254);
      const values = Array.from({ length: 1 + next(30) }, () => next(n));
      for (const options of [{ code: "truncated", n }, { code: "unary" }] as const) {
        const input = values.join(" ");
        expect(read(prefix.decode(prefix.encode(text(input), options), options).bytes)).toBe(input);
      }
      const gamma = values.map((value) => value + 1).join(" ");
      const bits = prefix.encode(text(gamma), { code: "gamma" });
      expect(read(prefix.decode(bits, { code: "gamma" }).bytes)).toBe(gamma);
      const letters = values.map((value) => "ABCD"[value % 4]).join("");
      expect(
        read(
          prefix.decode(prefix.encode(text(letters), { codebook: book }), { codebook: book }).bytes,
        ),
      ).toBe(letters);
    }
  });

  it("refuses a codebook that is not prefix-free and names the pair", () => {
    expect(() => prefix.kraft({ codebook: { A: "0", B: "01" } })).toThrow(
      '"A" (U+0041) = 0 is a prefix of "B" (U+0042) = 01',
    );
    expect(() => prefix.kraft({ codebook: "X=110 A=1 B=0" })).toThrow(
      '"A" (U+0041) = 1 is a prefix of "X"',
    );
    expect(() => prefix.kraft({ codebook: "A=10 B=10" })).toThrow("the same codeword 10");
    expect(() => prefix.kraft({ codebook: "A=0 A=1" })).toThrow('gives "A" (U+0041) two codewords');
  });

  it("reports the Kraft sum, so a code with free leaves shows", () => {
    expect(prefix.kraft({ codebook: book })).toBe("1");
    expect(prefix.kraft({ codebook: "A=0 B=10" })).toBe("3/4");
    expect(prefix.kraft({ codebook: "A=00 B=01 C=10 D=110" })).toBe("7/8");
    expect(prefix.kraft({ code: "gamma" })).toBe("1");
    const wide = Object.fromEntries(
      Array.from({ length: 2 ** 17 }, (_, index) => [
        String.fromCodePoint(0x10000 + index),
        index.toString(2).padStart(17, "0"),
      ]),
    );
    expect(prefix.kraft({ codebook: wide })).toBe("1");
  });

  it("hands back bits at the end that start a codeword, and refuses bits that start none", () => {
    expect(decoded("1", { codebook: book })).toEqual({ text: "", kraft: "1", leftover: "1" });
    expect(decoded("0 11", { codebook: book })).toEqual({ text: "A", kraft: "1", leftover: "11" });
    expect(decoded("0000", { code: "gamma" })).toEqual({ text: "", kraft: "1", leftover: "0000" });
    expect(decoded("00", { code: "truncated", n: 5 })).toEqual({
      text: "0",
      kraft: "1",
      leftover: "",
    });
    expect(decoded("011", { code: "truncated", n: 5 })).toEqual({
      text: "1",
      kraft: "1",
      leftover: "1",
    });
    expect(() => prefix.decode("0 11", { codebook: "A=0 B=10" })).toThrow(
      "bits 11 at index 2 start no codeword",
    );
    expect(() => prefix.decode("01x", { code: "unary" })).toThrow(DecodeError);
  });

  it("names what a code can't write", () => {
    expect(() => prefix.encode(text("AZ"), { codebook: book })).toThrow(
      '"Z" (U+005A) at index 1 has no codeword; add it to the codebook',
    );
    expect(() => prefix.encode(text("5"), { code: "truncated", n: 5 })).toThrow("takes 0 to 4");
    expect(() => prefix.encode(text("0"), { code: "gamma" })).toThrow("starts at 1");
    expect(prefix.encode(text("255"), { code: "unary" })).toHaveLength(256);
    expect(() => prefix.encode(text("256"), { code: "unary" })).toThrow("unary takes 0 to 255");
    expect(() => prefix.decode(`${"1".repeat(256)}0`, { code: "unary" })).toThrow(
      "the unary run at index 0 is over 255",
    );
    expect(() => prefix.encode(text("3 12x"), { code: "gamma" })).toThrow(
      '"x" (U+0078) at index 4',
    );
  });

  it("refuses options that don't add up", () => {
    expect(() => prefix.decode("0", {})).toThrow("give a codebook or a code");
    expect(() => prefix.decode("0", { codebook: book, code: "unary" })).toThrow("not both");
    expect(() => prefix.decode("0", { code: "unary", n: 3 })).toThrow("only the truncated code");
    expect(() => prefix.decode("0", { code: "truncated" })).toThrow("needs the number of symbols");
    for (const n of [1, 2.5, Number.NaN, 2 ** 32 + 1]) {
      expect(() => prefix.decode("0", { code: "truncated", n })).toThrow(InvalidOptionError);
    }
    for (const codebook of ["AB=0", "A0", "A=", "A=012", "{", "[]", ""]) {
      expect(() => prefix.kraft({ codebook }), codebook).toThrow(InvalidOptionError);
    }
    expect(() => prefix.codebook({ code: "unary" })).toThrow("no end");
    expect(prefix.kraft({ codebook: { A: "0".repeat(256), B: "1" } })).toBe(
      `${(1n << 255n) + 1n}/${1n << 256n}`,
    );
    expect(() => prefix.kraft({ codebook: { A: "0".repeat(257), B: "1" } })).toThrow(
      'Invalid option codebook=257 characters: the codeword of "A" (U+0041) is over 256 bits',
    );
    expect(() => prefix.kraft({ codebook: `{"A": "${"x".repeat(50)}"` })).toThrow(
      "Invalid option codebook=58 characters: is not valid JSON",
    );
    expect(() => prefix.codebook({ code: "truncated", n: 2 ** 20 })).toThrow("lists up to 65536");
  });

  it("refuses options of the wrong type", () => {
    for (const options of [null, 5, [], { codebook: 5 }, { codebook: ["A"] }, { code: "zeta" }]) {
      expect(() => prefix.decode("0", options as never)).toThrow(EncodingError);
    }
  });
});

describe("square", () => {
  const every = Uint8Array.from({ length: 64 }, (_, index) => index);
  const indices = (squares: string, options?: Parameters<typeof square.decode>[1]) => [
    ...square.decode(squares, options),
  ];

  it.each(CHESS_LAYOUTS)("agrees with python-chess on every square with layout %s", (layout) => {
    expect(square.encode(every, { layout })).toBe(chessSquares[layout]);
    expect(square.decode(chessSquares[layout], { layout })).toEqual(every);
  });

  it("agrees with python-chess on every square as a pair", () => {
    expect(square.encode(every, { pairs: true })).toBe(chessSquares.pairs);
    expect(square.decode(chessSquares.pairs, { pairs: true })).toEqual(every);
  });

  it("numbers the same squares three ways", () => {
    expect(indices("e4 d5")).toEqual([28, 35]);
    expect(indices("e4 a1", { layout: "a8" })).toEqual([36, 56]);
    expect(indices("a2 b1", { layout: "file" })).toEqual([1, 8]);
    expect(indices("(4, 3) (3, 4)", { pairs: true, layout: "a8" })).toEqual([36, 27]);
  });

  it("round trips every square in every layout and form", () => {
    for (const layout of CHESS_LAYOUTS) {
      for (const pairs of [false, true]) {
        expect(square.decode(square.encode(every, { layout, pairs }), { layout, pairs })).toEqual(
          every,
        );
      }
    }
  });

  it("takes capitals, commas and line breaks between squares", () => {
    expect(indices("E4,D5")).toEqual([28, 35]);
    expect(indices(" e4,\n d5 ")).toEqual([28, 35]);
    expect(indices("")).toEqual([]);
  });

  it("takes pairs with or without spaces, and side by side", () => {
    expect(indices("(4,3),( 3 , 4 )", { pairs: true })).toEqual([28, 35]);
    expect(indices("(4, 3)(3, 4)", { pairs: true })).toEqual([28, 35]);
  });

  it.each([
    ["e9", 1, '"9" (U+0039) is not a rank, 1 to 8'],
    ["e4 i4", 3, '"i" (U+0069) is not a file, a to h'],
    ["a1 e", 3, '"e" at index 3 has no rank'],
    ["e4 e44", 5, '"4" (U+0034) follows the square e4'],
    ["(4, 3)", 0, "for (file, rank) pairs, set pairs"],
  ] as const)("points at the bad character in %s", (input, index, message) => {
    const decode = () => square.decode(input);
    expect(decode).toThrow(expect.objectContaining({ name: "DecodeError", index }));
    expect(decode).toThrow(message);
  });

  it.each([
    ["(8, 1)", 1, '"8" (U+0038) is not a file, 0 to 7'],
    ["(4, 3) (4 3)", 10, '"3" (U+0033) where , goes'],
    ["(4, 31)", 5, '"1" (U+0031) where ) goes'],
    ["e4", 0, "for names such as e4, leave pairs off"],
  ] as const)("points at the bad character in the pairs %s", (input, index, message) => {
    const decode = () => square.decode(input, { pairs: true });
    expect(decode).toThrow(expect.objectContaining({ name: "DecodeError", index }));
    expect(decode).toThrow(message);
  });

  it("names a pair cut short without an index", () => {
    expect(() => square.decode("(4, 3", { pairs: true })).toThrow(
      expect.objectContaining({ index: undefined }),
    );
    expect(() => square.decode("(4,", { pairs: true })).toThrow(
      "the pair at index 0 ends before its rank",
    );
  });

  it("refuses a byte past the last square and options of the wrong kind", () => {
    expect(() => square.encode(Uint8Array.of(63, 64))).toThrow(
      "square: byte 64 at index 1 is over 63, the last square",
    );
    expect(() => square.decode("e4", { layout: "h8" as never })).toThrow(InvalidOptionError);
    expect(() => square.decode("e4", { pairs: "yes" as never })).toThrow(InvalidOptionError);
  });
});
