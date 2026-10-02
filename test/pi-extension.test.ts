import { fileURLToPath } from "node:url";

import { wireSchema } from "@agntn/tools";
import { describe, expect, it } from "vite-plus/test";

import { encodingTools } from "../src/tools.ts";
import { loadPiExtension } from "./fixtures/pi-host.ts";

const extensionPath = fileURLToPath(
  new URL("../packages/pi/extensions/encodings.ts", import.meta.url),
);

describe("pi encodings extension", () => {
  it("registers every tool with the shared schemas", async () => {
    const host = await loadPiExtension(extensionPath);

    expect([...host.tools.keys()]).toEqual(encodingTools.map((tool) => tool.name));
    for (const definition of encodingTools) {
      expect(host.tool(definition.name).parameters).toEqual(wireSchema(definition));
    }
  });

  it("executes through the shared executor and returns structured details", async () => {
    const host = await loadPiExtension(extensionPath);

    const result = await host.tool("encodings_decode").execute(
      "call-1",
      {
        encoding: "base58",
        text: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
        options: { check: true },
      },
      undefined,
      undefined,
      host.context,
    );

    expect(result.content[0]?.type).toBe("text");
    expect(result.details).toMatchObject({
      encoding: "base58",
      options: { check: true },
      hex: "0062e907b15cbf27d5425399ebf6f0fb50ebb88f18",
      byteLength: 21,
    });
  });

  it("fails the call on arguments the schema rejects and on a bad checksum", async () => {
    const host = await loadPiExtension(extensionPath);
    const decode = host.tool("encodings_decode");

    // Pi records every returned value as a successful call; only a throw fails it.
    await expect(
      decode.execute("call-1", { encoding: "hex" }, undefined, undefined, host.context),
    ).rejects.toThrow("Invalid arguments");
    await expect(
      decode.execute(
        "call-2",
        {
          encoding: "base58",
          text: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb",
          options: { check: true },
        },
        undefined,
        undefined,
        host.context,
      ),
    ).rejects.toThrow("checksum does not match");
  });
});
