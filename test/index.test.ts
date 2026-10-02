import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { familyEntries } from "../build.config.ts";
import {
  InvalidOptionError,
  UnknownEncodingError,
  create,
  decode,
  encode,
  encodingFamilies,
  encodingInfos,
  encodings,
  has,
  hex,
  identify,
  register,
  resolveEncoding,
  version,
  type Encoding,
} from "../src/index.ts";

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version: string;
  exports: Record<string, unknown>;
};

describe("@agntn/encodings", () => {
  it("exports the manifest version", () => {
    expect(version).toBe(manifest.version);
  });

  it("lists the built-ins in a fixed order", () => {
    expect(encodings()).toEqual([
      "binary",
      "octal",
      "decimal",
      "hex",
      "base32",
      "base45",
      "base58",
      "base64",
      "base85",
      "base91",
      "base256",
      "bech32",
      "uuencode",
      "quoted-printable",
    ]);
  });

  it("gives every built-in a family from the list and a subpath for that family", () => {
    for (const info of encodingInfos()) {
      expect(encodingFamilies).toContain(info.family);
      expect(manifest.exports).toHaveProperty(`./${info.family}`);
    }
    expect([...familyEntries].toSorted()).toEqual([...encodingFamilies].toSorted());
  });
});

describe("family subpaths", () => {
  const expected: Record<string, string[]> = {
    binary: ["binary"],
    octal: ["octal"],
    decimal: ["decimal"],
    hex: ["hex"],
    base32: ["BASE32_ALPHABETS", "base32"],
    base45: ["base45"],
    base58: ["BASE58_ALPHABETS", "base58", "createBase58check"],
    base64: ["BASE64_ALPHABETS", "base64"],
    base85: ["BASE85_ALPHABETS", "base85"],
    base91: ["base91"],
    base256: ["BASE256_ALPHABETS", "base256"],
    bech32: [
      "BECH32_LIMIT",
      "bech32",
      "bech32m",
      "fromWords",
      "fromWordsUnsafe",
      "segwit",
      "toWords",
    ],
    uuencode: ["uuencode"],
    "quoted-printable": ["quotedPrintable"],
  };

  const subpathOnly = new Set(["createBase58check", "fromWords", "fromWordsUnsafe", "toWords"]);

  it.each(Object.entries(expected))("./%s exposes only its codecs", async (family, names) => {
    const module = (await import(`../src/${family}.ts`)) as Record<string, unknown>;
    expect(Object.keys(module).toSorted()).toEqual(names.toSorted());
    const root = (await import("../src/index.ts")) as Record<string, unknown>;
    for (const name of names) {
      if (subpathOnly.has(name)) expect(root).not.toHaveProperty(name);
      else expect(module[name]).toBe(root[name]);
    }
  });
});

describe("resolveEncoding", () => {
  it.each([
    ["base64", "base64"],
    ["Base 64", "base64"],
    ["BASE_58", "base58"],
    ["Quoted Printable", "quoted-printable"],
    ["qp", "quoted-printable"],
    ["b64", "base64"],
    ["base16", "hex"],
    ["basE91", "base91"],
    ["base256emoji", "base256"],
  ])("reads %j as %s", (typed, name) => {
    expect(resolveEncoding(typed)).toBe(name);
  });

  it("names the available encodings when nothing matches", () => {
    expect(() => resolveEncoding("base62")).toThrow(UnknownEncodingError);
    expect(() => resolveEncoding("base62")).toThrow(/Available: binary, octal, decimal, hex/u);
    expect(() => resolveEncoding("toString")).toThrow(UnknownEncodingError);
    expect(() => resolveEncoding("base58check")).toThrow(UnknownEncodingError);
  });
});

describe("encode and decode through the registry", () => {
  it("reads strings as UTF-8 and takes bytes as they are", () => {
    expect(encode("base64", "zażółć")).toBe("emHFvMOzxYLEhw==");
    expect(encode("hex", new Uint8Array([1, 2]))).toBe("0102");
  });

  it("checks options against what the encoding declares", () => {
    expect(encode("hex", "A", { upper: true })).toBe("41");
    expect(encode("hex", "ÿ", { upper: true })).toBe("C3BF");
    expect(() => encode("base45", "x", { upper: true })).toThrow(
      "Invalid option upper=true: this encoding takes no options",
    );
    expect(() => encode("hex", "x", { lower: true })).toThrow("not an option here; use upper");
    expect(() => encode("hex", "x", { upper: "yes" })).toThrow("must be a boolean");
    expect(encode("base32", "f")).toBe("MY======");
    expect(encode("base32", "f", { padding: false })).toBe("MY");
    expect(encode("base32", "f", { alphabet: "hex", padding: false })).toBe("CO");
    expect(encode("base32", "f", { alphabet: "crockford" })).toBe("CR");
    expect(
      encode("base64", new Uint8Array([0xfb, 0xff]), { alphabet: "url", padding: false }),
    ).toBe("-_8");
    expect(encode("base58", new Uint8Array([0]), { check: true })).toBe("1Wh4bh");
    expect(encode("base85", new Uint8Array(4), { alphabet: "ascii85", delimiters: true })).toBe(
      "<~z~>",
    );
    expect(() => encode("base85", "x", { delimiters: true })).toThrow(
      "only the ascii85 alphabet has them",
    );
    expect(() => encode("base32", "f", { alphabet: "flickr" })).toThrow(
      "Invalid option alphabet=flickr: use one of standard, hex, crockford, z",
    );
    expect(() => encode("base45", "f", { padding: false })).toThrow("takes no options");
    expect(() => encode("bech32", "x")).toThrow(InvalidOptionError);
    expect(() => encode("bech32", "x")).toThrow("prefix=undefined: is required");
  });

  it("reads with the options marked decode and refuses the rest", () => {
    expect(decode("base32", "CO", { alphabet: "hex" }).bytes).toEqual(new Uint8Array([0x66]));
    expect(decode("base64", "-_8", { alphabet: "url" }).bytes).toEqual(
      new Uint8Array([0xfb, 0xff]),
    );
    expect(decode("base58", "1Wh4bh", { check: true }).bytes).toEqual(new Uint8Array([0]));
    expect(decode("base85", "<~z~>", { alphabet: "ascii85" }).bytes).toEqual(new Uint8Array(4));
    expect(decode("binary", "1001000 1101001", { symbols: "01", bits: 7 }).bytes).toEqual(
      new TextEncoder().encode("Hi"),
    );
    expect(encode("binary", "Hi", { symbols: "ab", order: "lsb", separate: false })).toBe(
      "aaabaababaababba",
    );
    expect(() => decode("binary", "0", { separate: false })).toThrow(
      "not an option here; use symbols, bits, order",
    );
    expect(() => decode("binary", "0", { bits: "7" })).toThrow("must be a number");
    expect(() => decode("binary", "0", { order: "middle" })).toThrow("use one of msb, lsb");
    expect(() => decode("base64", "-_8")).toThrow("not in the alphabet");
    expect(() => decode("base32", "MY", { padding: false })).toThrow(
      "not an option here; use alphabet",
    );
    expect(() => decode("base85", "x", { delimiters: true })).toThrow(
      "not an option here; use alphabet",
    );
    expect(() => decode("hex", "41", { upper: true })).toThrow("this encoding takes no options");
    expect(() => decode("base32", "CO", { alphabet: true })).toThrow("must be a string");
    expect(() => decode("base58", "1", { alphabet: "z" })).toThrow(
      "use one of bitcoin, flickr, ripple",
    );
  });

  it("returns a segwit address as its program with the version in details", () => {
    const decoded = decode("bech32", "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4");
    expect(hex.encode(decoded.bytes)).toBe("751e76e8199196d454941c45d1b3a323f1433bd6");
    expect(decoded.details).toEqual({ prefix: "bc", witnessVersion: 0 });
  });

  it("reads a Taproot address with m and refuses a version 0 address with it", () => {
    const taproot = "bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0";
    expect(decode("bech32", taproot, { m: true }).details).toEqual({
      prefix: "bc",
      witnessVersion: 1,
    });
    expect(() => decode("bech32", taproot)).toThrow("checksum is bech32m's");
    expect(() =>
      decode("bech32", "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4", { m: true }),
    ).toThrow("checksum is bech32's");
    const written = encode("bech32", "hi", { prefix: "test", m: true });
    expect(new TextDecoder().decode(decode("bech32", written, { m: true }).bytes)).toBe("hi");
    expect(() => decode("bech32", written)).toThrow("checksum is bech32m's");
  });

  it("returns plain bech32 data, such as a Nostr key, as bytes", () => {
    const npub = encode(
      "bech32",
      hex.decode("7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e"),
      {
        prefix: "npub",
      },
    );
    expect(npub).toBe("npub10elfcs4fr0l0r8af98jlmgdh9c8tcxjvz9qkw038js35mp4dma8qzvjptg");
    const decoded = decode("bech32", npub);
    expect(decoded.details).toEqual({ prefix: "npub" });
    expect(hex.encode(decoded.bytes)).toBe(
      "7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e",
    );
  });

  it("reads a long Lightning-style text without the 90-character limit", () => {
    const long = encode("bech32", new Uint8Array(100), { prefix: "lnbc", limit: 400 });
    expect(decode("bech32", long).bytes).toHaveLength(100);
  });

  it("carries a uuencode file name and mode in details", () => {
    const text = encode("uuencode", "Cat", { name: "cat.txt", mode: "600" });
    expect(decode("uuencode", text).details).toEqual({ mode: "600", name: "cat.txt" });
  });
});

describe("register", () => {
  it("adds an encoding that the registry and identify use", () => {
    const reverse: Encoding = {
      name: "reversed-hex",
      info: () => ({
        name: "reversed-hex",
        label: "Reversed hex",
        description: "Hex, written backwards",
        family: "test",
        standard: "none",
        alphabet: "0123456789abcdef",
        checksum: false,
        padding: false,
        options: [],
      }),
      encode: (input) => create("hex").encode(input).split("").toReversed().join(""),
      decode: (text) => create("hex").decode(text.split("").toReversed().join("")),
    };
    register(reverse);
    expect(has("reversed-hex")).toBe(true);
    expect(encode("reversed-hex", "A")).toBe("14");
    expect(encodingInfos("test").map((info) => info.name)).toEqual(["reversed-hex"]);
    expect(identify("14", { encodings: ["reversed-hex"] })[0]?.encoding).toBe("reversed-hex");
  });
});
