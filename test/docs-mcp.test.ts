import { readdirSync, readFileSync } from "node:fs";
import { Client as SiteClient } from "../docs/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { InMemoryTransport as SiteTransport } from "../docs/node_modules/@modelcontextprotocol/sdk/dist/esm/inMemory.js";
import { McpServer } from "../docs/node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js";
import type { CallToolResult } from "../docs/node_modules/@modelcontextprotocol/sdk/dist/esm/types.js";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { callTool, toolListings } from "../src/mcp.ts";

/* The toolkit's entry pulls in Nitro, and `defineMcpTool` only hands its input back. */
vi.mock(
  "../docs/node_modules/@nuxtjs/mcp-toolkit/dist/runtime/server/mcp/definitions/index.js",
  () => ({
    defineMcpTool: (definition: unknown) => definition,
  }),
);

const toolsDir = new URL("../docs/server/mcp/tools/", import.meta.url);

const openConnections: Array<{ close(): Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(openConnections.splice(0).map((connection) => connection.close()));
});

/* An SDK client on every docs tool, through the same SDK copy the worker runs. */
async function siteClient(): Promise<SiteClient> {
  const { encodingsMcpTool } = await import("../docs/server/utils/encodings-mcp.ts");
  const server = new McpServer({ name: "encodings-docs", version: "0.0.0" });
  for (const listing of toolListings) {
    const tool = encodingsMcpTool(listing.name);
    const handler = tool.handler as (
      args: Readonly<Record<string, unknown>>,
    ) => Promise<CallToolResult>;
    server.registerTool(listing.name, tool, handler);
  }
  const [clientTransport, serverTransport] = SiteTransport.createLinkedPair();
  const client = new SiteClient({ name: "encodings-docs-test", version: "0.0.0" });
  openConnections.push(client, server);
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe("docs MCP tools", () => {
  it("serves every tool `encodings mcp` lists, one file each", () => {
    const files = readdirSync(toolsDir).toSorted();
    expect(files).toEqual(
      toolListings.map((tool) => `${tool.name.replaceAll("_", "-")}.ts`).toSorted(),
    );
    for (const file of files) {
      const name = file.slice(0, -".ts".length).replaceAll("-", "_");
      expect(readFileSync(new URL(file, toolsDir), "utf8")).toBe(
        `export default encodingsMcpTool(${JSON.stringify(name)});\n`,
      );
    }
  });

  it("reads a call without arguments as `{}`, like `encodings mcp`", async () => {
    const client = await siteClient();
    const served = await client.callTool({ name: "encodings_info" });
    expect(served.isError).toBeFalsy();
    expect(served.content).toEqual((await callTool("encodings_info", {})).content);

    const required = await client.callTool({ name: "encodings_decode" });
    expect(required.isError).toBe(true);
    expect(required.content).toEqual((await callTool("encodings_decode", {})).content);
  });
});
