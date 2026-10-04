import { describe, expect, it } from "vite-plus/test";
import {
  InvalidOptionError,
  create,
  encode,
  identify,
  peel,
  register,
  type Encoding,
} from "../src/index.ts";

const top = (text: string) => identify(text)[0];

describe("identify", () => {
  it.each([
    ["SGVsbG8=", "base64", "Hello"],
    ["48656c6c6f", "hex", "Hello"],
    ["0x48656c6c6f", "hex", "Hello"],
    ["01001000 01101001", "binary", "Hi"],
    ["72 101 108 108 111", "decimal", "Hello"],
    ["110 145 154 154 157", "octal", "Hello"],
    ["Xk~0{Zy<MXa%^M", "base85", "hello world"],
    ["JBSWY3DPEBLW64TMMQ======", "base32", "Hello World"],
    ["QED8WEX0", "base45", "ietf!"],
    ["StV1DL6CwTryKyV", "base58", "hello world"],
    ["<~87cURD_*#4DfTZ)+T~>", "base85", "Hello, World!"],
    [">OwJh>}AQ;r@@Y?F", "base91", "Hello, World!"],
    ["caf=C3=A9", "quoted-printable", "café"],
    ["begin 644 cat.txt\n#0V%T\n`\nend\n", "uuencode", "Cat"],
  ])("puts %j first as %s", (text, encoding, decoded) => {
    expect(top(text)).toMatchObject({ encoding, text: decoded });
  });

  it.each([
    ["1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", "base58", { check: true }],
    ["rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh", "base58", { alphabet: "ripple", check: true }],
    ["bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4", "bech32", undefined],
    ["bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0", "bech32", { m: true }],
  ])("trusts a matching checksum over everything else in %s", (text, encoding, options) => {
    const best = top(text)!;
    expect(best.encoding).toBe(encoding);
    expect(best.options).toEqual(options);
    expect(best.reasons).toContain("checksum matches");
    expect(best.confidence).toBeGreaterThan(0.5);
  });

  it("explains each score and keeps the details of the text", () => {
    const best = top("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4")!;
    expect(best.details).toEqual({ prefix: "bc", witnessVersion: 0 });
    expect(top("SGVsbG8=")!.reasons).toEqual([
      "padding fits the block length",
      "decodes to readable text",
    ]);
  });

  it("leaves out encodings that return the text unchanged or nothing", () => {
    expect(identify("Hello world").map((candidate) => candidate.encoding)).not.toContain(
      "quoted-printable",
    );
    expect(identify("SGVsbG8=").map((candidate) => candidate.encoding)).not.toContain(
      "quoted-printable",
    );
  });

  it("tries the alphabet options and names the one a reading needs", () => {
    expect(top(encode("binary", "Hello world", { order: "lsb" }))).toMatchObject({
      encoding: "binary",
      options: { order: "lsb" },
      text: "Hello world",
    });
    expect(top("CPNMUOJ1E8======")).toMatchObject({
      encoding: "base32",
      options: { alphabet: "hex" },
      text: "foobar",
    });
    expect(top("c3ViamVjdHM_X2Q-Pg")).toMatchObject({
      encoding: "base64",
      options: { alphabet: "url" },
      text: "subjects?_d>>",
    });
    expect(top("<~87cURD_*#4DfTZ)+T~>")).toMatchObject({
      options: { alphabet: "ascii85" },
      reasons: ["<~ ~> delimiters", "decodes to readable text"],
    });
    expect(top("pb1sa5dxrb5s6huccooo")).toMatchObject({
      encoding: "base32",
      options: { alphabet: "z" },
      text: "hello world!",
    });
  });

  it("puts base256emoji with its multibase prefix ahead of the zero byte the 🚀 also spells", () => {
    const [best, next] = identify("🚀😝🌈🌷😝");
    expect(best).toMatchObject({
      encoding: "base256",
      options: { multibase: true },
      text: "gsmg",
      reasons: ["🚀 multibase prefix", "decodes to readable text"],
    });
    expect(next).toMatchObject({ encoding: "base256", text: "\0gsmg" });
    expect(next!.options).toBeUndefined();
  });

  it("flips switches from their default, together when one alone does not read", () => {
    const loose: Encoding = {
      name: "strict-hex",
      info: () => ({
        name: "strict-hex",
        label: "Strict hex",
        description: "Hex after a tilde, read only with strict off and tilde on",
        family: "test",
        standard: "none",
        alphabet: "~0123456789abcdef",
        checksum: false,
        padding: false,
        options: [
          {
            name: "strict",
            type: "boolean",
            required: false,
            default: true,
            description: "Refuse everything",
            decode: true,
          },
          {
            name: "tilde",
            type: "boolean",
            required: false,
            default: false,
            description: "Expect a tilde",
            decode: true,
          },
        ],
      }),
      encode: (input) => `~${create("hex").encode(input)}`,
      decode: (text, options) => {
        if (options?.["strict"] !== false || options["tilde"] !== true) throw new Error("strict");
        if (!text.startsWith("~")) throw new Error("no tilde");
        return create("hex").decode(text.slice(1));
      },
    };
    register(loose);
    expect(identify("~48656c6c6f", { encodings: ["strict-hex"] })).toMatchObject([
      { encoding: "strict-hex", options: { strict: false, tilde: true }, text: "Hello" },
    ]);
  });

  it("never tries an option that only narrows decoding", () => {
    const seen: string[] = [];
    register({
      name: "narrow-hex",
      info: () => ({
        name: "narrow-hex",
        label: "Narrow hex",
        description: "Hex with a switch that only refuses text",
        family: "test",
        standard: "none",
        alphabet: "0123456789abcdef",
        checksum: false,
        padding: false,
        options: [
          {
            name: "picky",
            type: "boolean",
            required: false,
            default: false,
            description: "Refuse more",
            decode: true,
            narrows: true,
          },
        ],
      }),
      encode: (input) => create("hex").encode(input),
      decode: (text, options) => {
        seen.push(JSON.stringify(options ?? {}));
        return create("hex").decode(text);
      },
    });
    expect(identify("48656c6c6f", { encodings: ["narrow-hex"] })).toMatchObject([
      { encoding: "narrow-hex", text: "Hello" },
    ]);
    expect(seen).toEqual(["{}"]);
    expect(identify("YR==").find((candidate) => candidate.encoding === "base64")).toMatchObject({
      text: "a",
    });
  });

  it("leaves out an option reading that gives the default reading's bytes", () => {
    const base64 = identify("SGVsbG8gd29ybGQ", { limit: 20 }).filter(
      (candidate) => candidate.encoding === "base64",
    );
    expect(base64).toHaveLength(1);
    expect(base64[0]).not.toHaveProperty("options");
  });

  it("ranks best first and honors the limit", () => {
    const candidates = identify("SGVsbG8gd29ybGQ", { limit: 3 });
    expect(candidates).toHaveLength(3);
    const scores = candidates.map((candidate) => candidate.confidence);
    expect(scores).toEqual(scores.toSorted((left, right) => right - left));
    expect(() => identify("x", { limit: 0 })).toThrow(InvalidOptionError);
  });

  it("skips base58 on long text, where decoding is quadratic", () => {
    const started = performance.now();
    const candidates = identify("2".repeat(5000));
    expect(candidates.map((candidate) => candidate.encoding)).not.toContain("base58");
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it("returns nothing for text no encoding reads", () => {
    expect(identify("~~~~~ ~~~~~ ~~~~")).toEqual([]);
  });
});

describe("peel", () => {
  const layers = (text: string) =>
    peel(text).map((layer) => [layer.encoding, layer.confirmed, layer.text ?? ""]);

  it("takes off every layer down to the text, outermost first", () => {
    const base64 = encode("base64", "The quick brown fox");
    const stacked = encode("base85", encode("binary", encode("hex", base64)));
    expect(layers(stacked).map(([encoding]) => encoding)).toEqual([
      "base85",
      "binary",
      "hex",
      "base64",
    ]);
    expect(peel(stacked).at(-1)).toMatchObject({ text: "The quick brown fox", confirmed: true });
    expect(layers(encode("decimal", encode("base32", "attack at dawn")))).toEqual([
      ["decimal", true, "MF2HIYLDNMQGC5BAMRQXO3Q="],
      ["base32", true, "attack at dawn"],
    ]);
  });

  it("ends on an unconfirmed guess when the last layer is bytes and not text", () => {
    const salted = Uint8Array.from([
      0x53, 0x61, 0x6c, 0x74, 0x65, 0x64, 0x5f, 0x5f, 0xb1, 0x96, 0xbe, 0xa1,
    ]);
    expect(peel("U2FsdGVkX1+xlr6h")).toEqual([
      expect.objectContaining({ encoding: "base64", confirmed: false }),
    ]);
    const wrapped = peel(encode("hex", encode("base64", salted)));
    expect(wrapped.map((layer) => [layer.encoding, layer.confirmed])).toEqual([
      ["hex", true],
      ["base64", false],
    ]);
    expect(wrapped[1]!.bytes).toEqual(salted);
  });

  it("stops at plain text instead of guessing an encoding for it", () => {
    expect(peel("Hello world")).toEqual([]);
    expect(layers(encode("base64", "matrixsumlist"))).toEqual([["base64", true, "matrixsumlist"]]);
  });

  it("does not let short text back a layer on its own", () => {
    expect(identify("hello")[0]).toMatchObject({
      encoding: "base85",
      options: { alphabet: "z85" },
    });
    expect(peel(encode("base64", "hello", {}))).toHaveLength(1);
  });

  it("trusts a checksum on bytes that are not text", () => {
    const address = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";
    expect(peel(address)).toEqual([
      expect.objectContaining({ encoding: "base58", options: { check: true }, confirmed: true }),
    ]);
  });

  it("names the options a layer needed", () => {
    expect(peel("D1IMOR3F41RMUSJCCGM20S35CLM0====")).toMatchObject([
      {
        encoding: "base32",
        options: { alphabet: "hex" },
        confirmed: true,
        text: "hello world, peel",
      },
    ]);
  });

  it("honors the limit and the encodings to try", () => {
    const stacked = encode("hex", encode("hex", "attack at dawn"));
    expect(peel(stacked, { limit: 1 }).map((layer) => layer.encoding)).toEqual(["hex"]);
    expect(peel(stacked, { encodings: ["bech32"] })).toEqual([]);
    expect(() => peel("x", { limit: 0 })).toThrow(InvalidOptionError);
  });
});
