import { ToolInputError, wireSchema } from "@agntn/tools";
import type { ToolDefinition } from "@oh-my-pi/pi-coding-agent";
import { describe, expect, it, vi } from "vite-plus/test";

/** Compiled OMP injects no TUI barrel, so loading it has to fail the test. */
vi.mock("@oh-my-pi/pi-coding-agent/tui", () => {
  throw new Error("The OMP host does not inject the TUI barrel");
});

import encodingsExtension from "../packages/omp/extensions/encodings.ts";
import { encodingTools } from "../src/tools.ts";
import {
  ompTestTheme as theme,
  ompToolContext,
  registerOmpExtension,
} from "./fixtures/omp-host.ts";

const CONTROL_BYTES = /\p{Cc}/u;

async function registerTool(name: string): Promise<ToolDefinition> {
  return (await registerOmpExtension(encodingsExtension)).tool(name);
}

function renderedText(component: unknown): string {
  return (component as { text: string }).text;
}

describe("omp encodings extension", () => {
  it("registers the four tools as read-approval tools under one label", async () => {
    const host = await registerOmpExtension(encodingsExtension);

    expect([...host.tools.keys()]).toEqual(encodingTools.map((tool) => tool.name));
    expect(host.labels).toEqual(["Encodings"]);
    for (const definition of encodingTools) {
      const tool = host.tool(definition.name);
      expect(tool.approval).toBe("read");
      expect(tool.parameters).toEqual(wireSchema(definition));
    }
  });

  it("refuses arguments the schema rejects", async () => {
    const tool = await registerTool("encodings_encode");

    await expect(
      tool.execute("call-1", { encoding: "hex" }, undefined, undefined, ompToolContext),
    ).rejects.toBeInstanceOf(ToolInputError);
  });

  it("executes against the library and returns structured details", async () => {
    const tool = await registerTool("encodings_encode");

    const result = await tool.execute(
      "call-1",
      { encoding: "base64", input: "Hello" },
      undefined,
      undefined,
      ompToolContext,
    );

    expect(result.details).toEqual({ encoding: "base64", text: "SGVsbG8=", byteLength: 5 });
  });

  it("draws the call with the encoding and a preview of the input", async () => {
    const tool = await registerTool("encodings_decode");

    const text = renderedText(
      tool.renderCall?.(
        { encoding: "base64", text: "SGVsbG8=" },
        { expanded: false, isPartial: false },
        theme,
      ),
    );

    expect(text).toBe("success:status.done accent(Decode): muted(base64 SGVsbG8=)");
  });

  it("sanitizes model arguments and cuts long ones before sanitizing", async () => {
    const tool = await registerTool("encodings_identify");
    const hostile = { text: "\u001B]0;evil\u0007a\u2028b\u202Ec\nnext" };

    const text = renderedText(
      tool.renderCall?.(hostile, { expanded: false, isPartial: false }, theme),
    );
    expect(text).not.toMatch(CONTROL_BYTES);
    expect(text).not.toMatch(/[\u2028\u202E]/u);

    const started = performance.now();
    tool.renderCall?.(
      { text: "\u001B]".repeat(100_000) },
      { expanded: false, isPartial: true },
      theme,
    );
    expect(performance.now() - started).toBeLessThan(500);
  });

  it("survives arguments that violate the declared types", async () => {
    const tool = await registerTool("encodings_encode");

    const text = renderedText(
      tool.renderCall?.(
        { encoding: 42, input: { a: 1 } },
        { expanded: false, isPartial: true },
        theme,
      ),
    );

    expect(text).toBe('muted:status.pending accent(Encode): muted(42 {"a":1})');
  });

  it("summarizes results and sanitizes their data", async () => {
    const decode = await registerTool("encodings_decode");
    const identify = await registerTool("encodings_identify");

    const decoded = renderedText(
      decode.renderResult?.(
        {
          content: [{ type: "text" as const, text: "ok" }],
          details: { value: "evil\u001B[31m\u009Bline", byteLength: 9 },
        },
        { expanded: false, isPartial: false },
        theme,
      ),
    );
    expect(decoded).not.toMatch(CONTROL_BYTES);
    expect(decoded).toContain("9 bytes");

    const ranked = renderedText(
      identify.renderResult?.(
        {
          content: [{ type: "text" as const, text: "ok" }],
          details: {
            candidates: [
              { encoding: "base64", confidence: 0.57 },
              { encoding: "hex", confidence: 0.1 },
            ],
          },
        },
        { expanded: false, isPartial: false },
        theme,
      ),
    );
    expect(ranked).toContain("base64 0.57");
  });

  it("marks an error result with the error icon and no meta", async () => {
    const tool = await registerTool("encodings_info");
    const result = { content: [{ type: "text" as const, text: "boom" }], isError: true };

    const text = renderedText(
      tool.renderResult?.(result, { expanded: false, isPartial: false }, theme),
    );

    expect(text).toBe("error:status.error accent(Encodings) accent([read])");
  });
});
