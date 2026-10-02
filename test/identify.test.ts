import { describe, expect, it } from "vite-plus/test";
import { InvalidOptionError, identify } from "../src/index.ts";

const top = (text: string) => identify(text)[0];

describe("identify", () => {
  it.each([
    ["SGVsbG8=", "base64", "Hello"],
    ["48656c6c6f", "hex", "Hello"],
    ["0x48656c6c6f", "hex", "Hello"],
    ["01001000 01101001", "binary", "Hi"],
    ["JBSWY3DPEBLW64TMMQ======", "base32", "Hello World"],
    ["QED8WEX0", "base45", "ietf!"],
    ["StV1DL6CwTryKyV", "base58", "hello world"],
    ["<~87cURD_*#4DfTZ)+T~>", "ascii85", "Hello, World!"],
    [">OwJh>}AQ;r@@Y?F", "base91", "Hello, World!"],
    ["caf=C3=A9", "quoted-printable", "café"],
    ["begin 644 cat.txt\n#0V%T\n`\nend\n", "uuencode", "Cat"],
  ])("puts %j first as %s", (text, encoding, decoded) => {
    expect(top(text)).toMatchObject({ encoding, text: decoded });
  });

  it.each([
    ["1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", "base58check"],
    ["bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4", "bech32"],
    ["bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0", "bech32m"],
  ])("trusts a matching checksum over everything else in %s", (text, encoding) => {
    const best = top(text)!;
    expect(best.encoding).toBe(encoding);
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
