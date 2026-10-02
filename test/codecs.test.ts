import { describe, expect, it } from "vite-plus/test";
import {
  ChecksumError,
  DecodeError,
  EncodingError,
  InvalidOptionError,
  ascii85,
  base32,
  base32crockford,
  base32hex,
  base45,
  base58,
  base58check,
  base58flickr,
  base58ripple,
  base64,
  base64url,
  base91,
  bech32,
  bech32m,
  binary,
  hex,
  quotedPrintable,
  segwit,
  uuencode,
  z85,
  zbase32,
} from "../src/index.ts";
import { blake256 } from "@agntn/hashes/blake256";
import { sha256 } from "@agntn/hashes/sha2";
import { createBase58check } from "../src/base58.ts";
import { fromWords, fromWordsUnsafe, toWords } from "../src/bech32.ts";
import { base58checkVariants, javascript, python } from "./fixtures/references.ts";

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
    expect(base32hex.encode(text(input))).toBe(b32h);
    expect(hex.encode(text(input))).toBe(Buffer.from(input).toString("hex"));
    expect(read(base64.decode(b64))).toBe(input);
    expect(read(base32.decode(b32))).toBe(input);
    expect(read(base32hex.decode(b32h))).toBe(input);
  });
});

describe("frozen outputs of independent implementations", () => {
  const codecs = {
    base58,
    "base58-flickr": base58flickr,
    "base58-ripple": base58ripple,
    base91,
    "base32-crockford": base32crockford,
    base32,
    base32hex,
    ascii85,
    base45,
    z85,
  } as const;

  it.each([...javascript, ...python])("matches row $hex", (row) => {
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

describe("hex", () => {
  it("writes either case and reads spaced, prefixed text", () => {
    expect(hex.encode(new Uint8Array([0xde, 0xad]), { upper: true })).toBe("DEAD");
    expect(hex.encode(hex.decode("0xDe Ad\nbe ef"))).toBe("deadbeef");
  });

  it("rejects an odd length and a non-digit with its index", () => {
    expect(() => hex.decode("abc")).toThrow("odd number of digits");
    expect(() => hex.decode("zz")).toThrow(DecodeError);
    expect(() => hex.decode("0g")).toThrow('"g" (U+0067) is not a hex digit');
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
});

describe("base32 and base64 decoding rules", () => {
  it("reads lowercase base32 and unpadded or wrapped text", () => {
    expect(read(base32.decode("mzxw6ytboi"))).toBe("foobar");
    expect(read(base64.decode("Zm9v\r\nYmFy"))).toBe("foobar");
    expect(read(base64.decode("Zg"))).toBe("f");
    expect(read(base64url.decode("Zg=="))).toBe("f");
  });

  it("writes base64url without padding and with - and _", () => {
    expect(base64url.encode(new Uint8Array([0xfb, 0xff]))).toBe("-_8");
  });

  it("rejects wrong padding, data after padding and impossible lengths", () => {
    expect(() => base64.decode("Zg=")).toThrow("1 padding characters where the length needs 2");
    expect(() => base64.decode("Zg==Zg==")).toThrow("character after padding at index 4");
    expect(() => base64.decode("Z")).toThrow("do not end on a byte");
    expect(() => base32.decode("M")).toThrow("do not end on a byte");
    expect(() => base64.decode("Zm9v!")).toThrow('"!" (U+0021) at index 4 is not in the alphabet');
  });

  it("reads Crockford's look-alikes and hyphens", () => {
    expect(base32crockford.decode("CSQPYRK1E8")).toEqual(base32crockford.decode("csqp-yrki-e8"));
    expect(base32crockford.decode("0O")).toEqual(base32crockford.decode("00"));
    expect(() => base32crockford.decode("UU")).toThrow("not in the alphabet");
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

describe("base58check", () => {
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
    expect(() => base58check.decode("0")).toThrow(/^base58check: "0"/u);
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

describe("basE91", () => {
  it("writes the reference implementation's output", () => {
    expect(base91.encode(text("Hello, World!"))).toBe(">OwJh>}AQ;r@@Y?F");
    expect(read(base91.decode(">OwJh>}AQ;r@@Y?F"))).toBe("Hello, World!");
  });

  it("rejects characters outside the alphabet instead of skipping them", () => {
    expect(() => base91.decode("ab-c")).toThrow('"-" (U+002D) at index 2 is not in the alphabet');
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

describe("round trips over every byte value", () => {
  const all = Uint8Array.from({ length: 256 }, (_, index) => index);
  it.each([
    ["binary", binary],
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
    ["base91", base91],
    ["uuencode", uuencode],
    ["quoted-printable", quotedPrintable],
  ] as const)("%s", (_, codec) => {
    expect(codec.decode(codec.encode(all))).toEqual(all);
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

  it("decodes a quoted-printable line too long to spread into one call", () => {
    expect(quotedPrintable.decode("a".repeat(500_000))).toHaveLength(500_000);
  });
});
