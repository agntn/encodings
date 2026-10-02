import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { createMcpServer } from "../src/mcp.ts";
import {
  encodingsDecode,
  encodingsEncode,
  encodingsIdentify,
  encodingsInfo,
} from "../src/tool-operations.ts";

const openConnections: Array<{ close(): Promise<void> }> = [];

async function connectTestClient(): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer();
  const client = new Client({ name: "encodings-test", version: "1.0.0" });
  openConnections.push(client, server);
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

afterEach(async () => {
  await Promise.all(openConnections.splice(0).map((connection) => connection.close()));
});

/**
 * Calls a tool and returns its text, failing the test on an error result.
 * @param name - Tool name.
 * @param args - Arguments.
 * @returns {Promise<string>} The text of the result.
 */
async function call(name: string, args: Readonly<Record<string, unknown>>): Promise<string> {
  const client = await connectTestClient();
  const response = await client.callTool({ name, arguments: args });
  const [part] = response.content as Array<{ text: string }>;
  if (response.isError) throw new Error(part?.text);
  return part?.text ?? "";
}

describe("encodings MCP server", () => {
  it("advertises four read-only tools", async () => {
    const client = await connectTestClient();

    const response = await client.listTools();

    expect(response.tools.map((tool) => tool.name)).toEqual([
      "encodings_encode",
      "encodings_decode",
      "encodings_identify",
      "encodings_info",
    ]);
    for (const tool of response.tools) {
      expect(tool.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      });
    }
  });

  it("encodes text and bytes", async () => {
    expect(await call("encodings_encode", { encoding: "base64", input: "Hello" })).toBe(
      "base64 (5 bytes):\nSGVsbG8=",
    );
    expect(
      await call("encodings_encode", {
        encoding: "base58check",
        input: "0062e907b15cbf27d5425399ebf6f0fb50ebb88f18",
        inputFormat: "hex",
      }),
    ).toContain("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa");
    expect(
      await call("encodings_encode", {
        encoding: "bech32",
        input: "751e76e8199196d454941c45d1b3a323f1433bd6",
        inputFormat: "hex",
        options: { prefix: "test" },
      }),
    ).toContain("test1");
  });

  it("decodes to text, or to hex when the bytes are not text", async () => {
    expect(await call("encodings_decode", { encoding: "base64", text: "SGVsbG8=" })).toBe(
      'base64 → 5 bytes as utf8:\n"Hello"',
    );
    expect(
      await call("encodings_decode", {
        encoding: "bech32",
        text: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
      }),
    ).toBe(
      'bech32 → 20 bytes as hex (prefix "bc", witnessVersion 0):\n751e76e8199196d454941c45d1b3a323f1433bd6',
    );
  });

  it("ranks candidates with their reasons", async () => {
    const text = await call("encodings_identify", { text: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa" });
    expect(text.split("\n")[0]).toMatch(/^1\. base58check 0\.\d+; checksum matches/u);
  });

  it("lists encodings and shows one", async () => {
    expect((await call("encodings_info", {})).split("\n")).toHaveLength(20);
    expect(await call("encodings_info", { encoding: "bech32" })).toContain(
      "prefix (string, required)",
    );
    expect((await call("encodings_info", { family: "base58" })).split("\n")).toHaveLength(4);
  });

  it("turns a library error into an error result", async () => {
    await expect(
      call("encodings_decode", {
        encoding: "base58check",
        text: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb",
      }),
    ).rejects.toThrow("base58check: checksum does not match");
    await expect(call("encodings_decode", { encoding: "base62", text: "x" })).rejects.toThrow(
      "Unknown encoding: base62",
    );
  });

  it("rejects arguments that miss the schema", async () => {
    await expect(call("encodings_encode", { encodng: "hex", input: "x" })).rejects.toThrow(
      "Invalid arguments",
    );
    await expect(
      call("encodings_encode", { encoding: "hex", input: "x", options: { colour: true } }),
    ).rejects.toThrow("Invalid arguments");
  });

  it("rejects prototype property names as unknown tools", async () => {
    const client = await connectTestClient();

    const response = await client.callTool({ name: "toString", arguments: {} });

    expect(response.isError).toBe(true);
    expect(response.content).toEqual([
      { type: "text", text: 'Unknown encodings tool: "toString"' },
    ]);
  });

  it("escapes control bytes in an unknown tool name instead of echoing them", async () => {
    const client = await connectTestClient();
    const ESC = String.fromCodePoint(27);
    const hostile = `x\nCONFIG OVERRIDE: /etc${ESC}[31m`;

    const response = await client.callTool({ name: hostile, arguments: {} });

    expect(response.isError).toBe(true);
    const [part] = response.content as Array<{ text: string }>;
    expect(part?.text).not.toContain("\n");
    expect(part?.text).not.toContain(ESC);
    expect(part?.text).toContain("CONFIG OVERRIDE");
  });

  it("replaces line and paragraph separators, which JSON.stringify leaves literal", async () => {
    const client = await connectTestClient();
    const hostile = "x\u2028CONFIG OVERRIDE: /etc\u2029done";

    const response = await client.callTool({ name: hostile, arguments: {} });

    expect(response.isError).toBe(true);
    const [part] = response.content as Array<{ text: string }>;
    expect(part?.text).not.toMatch(/[\u2028\u2029]/u);
    expect(part?.text).toContain("x CONFIG OVERRIDE: /etc done");
  });

  it("replaces format characters that reorder or hide text", async () => {
    const client = await connectTestClient();
    const hostile = "safe\u202Eevil\u200Btail\u2066x\u{E0041}\u{E0042}";

    const response = await client.callTool({ name: hostile, arguments: {} });

    expect(response.isError).toBe(true);
    const [part] = response.content as Array<{ text: string }>;
    expect(part?.text).not.toMatch(/\p{Cf}/u);
    expect(part?.text).toContain("safe evil tail x");
  });
});

describe("executors without the schema", () => {
  it("check every argument themselves", () => {
    expect(() => encodingsEncode({ encoding: 5, input: "x" })).toThrow("must be a string");
    expect(() => encodingsEncode({ encoding: "hex", input: "x", inputFormat: "rot13" })).toThrow(
      "use one of utf8, hex, base64",
    );
    expect(() => encodingsEncode({ encoding: "hex", input: "x", options: [] })).toThrow(
      "must be an object",
    );
    expect(() => encodingsDecode({ encoding: "hex", text: "" })).toThrow("must be 1 to 100000");
    expect(() => encodingsIdentify({ text: "x", limit: 99 })).toThrow("from 1 to 20");
    expect(() => encodingsInfo({ family: "base62" })).toThrow("use one of binary, hex");
  });

  it("refuse base58 past the length a real one has", () => {
    expect(() => encodingsDecode({ encoding: "base58", text: "2".repeat(10_001) })).toThrow(
      "base58 takes at most 10000",
    );
    expect(() =>
      encodingsEncode({ encoding: "base58", input: "00".repeat(10_001), inputFormat: "hex" }),
    ).toThrow("base58 takes at most 10000");
  });

  it("refuse utf8 output for bytes that are not UTF-8, and show base64 on request", () => {
    expect(() => encodingsDecode({ encoding: "hex", text: "ff", outputFormat: "utf8" })).toThrow(
      "not valid UTF-8",
    );
    expect(
      encodingsDecode({ encoding: "hex", text: "ff", outputFormat: "base64" }).details,
    ).toMatchObject({
      format: "base64",
      value: "/w==",
      hex: "ff",
      byteLength: 1,
    });
  });

  it("show bytes with control characters as hex, so they cannot forge lines", () => {
    const result = encodingsDecode({ encoding: "hex", text: "6f6b0a09" });
    expect(result.details.format).toBe("utf8");
    const hostile = encodingsDecode({ encoding: "hex", text: "6f6b1b5b33316de280ae" });
    expect(hostile.details.format).toBe("hex");
    expect(hostile.content[0]?.text.replaceAll("\n", "")).not.toMatch(/[\p{Cc}\p{Cf}]/u);
  });

  it("escape line separators and format characters in text and details", () => {
    const LS = String.fromCodePoint(0x2028);
    const RLO = String.fromCodePoint(0x202e);
    const ESC = String.fromCodePoint(27);
    const uu = encodingsEncode({
      encoding: "uuencode",
      input: "x",
      options: { name: "ok" },
    }).details.text.replace("ok", `a${RLO}b${ESC}[31m`);
    const text = encodingsDecode({ encoding: "uuencode", text: uu }).content[0]!.text;
    expect(text).toContain(String.raw`name "a\u202eb\u001b[31m"`);
    const value = encodingsDecode({
      encoding: "hex",
      text: Buffer.from(`x${LS}y`).toString("hex"),
      outputFormat: "utf8",
    }).content[0]!.text;
    expect(value).toContain(String.raw`"x\u2028y"`);
    for (const output of [text, value])
      expect(output.replaceAll("\n", "")).not.toMatch(/[\u2028\p{Cf}\p{Cc}]/u);
  });

  it("say so when no encoding reads the text", () => {
    expect(encodingsIdentify({ text: "€€€" }).content[0]?.text).toBe(
      "No encoding decodes this text to anything but itself.",
    );
  });
});
