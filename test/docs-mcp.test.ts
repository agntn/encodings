import type { ToolkitTool } from "../docs/node_modules/@agntn/tools/dist/toolkit.mjs";
import { Client as SiteClient } from "../docs/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { InMemoryTransport as SiteTransport } from "../docs/node_modules/@modelcontextprotocol/sdk/dist/esm/inMemory.js";
import { McpServer } from "../docs/node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js";
import type { CallToolResult } from "../docs/node_modules/@modelcontextprotocol/sdk/dist/esm/types.js";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { callTool, toolListings } from "../src/mcp.ts";

/* The toolkit's entry pulls in Nitro, so the handler gets its page tools and options here. */
vi.mock(
  "../docs/node_modules/@nuxtjs/mcp-toolkit/dist/runtime/server/mcp/definitions/index.js",
  () => ({
    defineMcpHandler: (options: unknown) => options,
    getMcpTools: async () => [{ name: "list-pages" }, { name: "get-page" }],
  }),
);

const openConnections: Array<{ close(): Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(openConnections.splice(0).map((connection) => connection.close()));
});

/* What `server/mcp/index.ts` serves for one request, Docus page tools included. */
async function siteTools(): Promise<ReadonlyArray<Readonly<ToolkitTool>>> {
  const { default: handler } = await import("../docs/server/mcp/index.ts");
  const { tools } = handler;
  if (typeof tools !== "function") throw new TypeError("the handler should resolve its tools");
  return (await tools(undefined as never)) as ToolkitTool[];
}

/* An SDK client on every encoding tool, through the same SDK copy the worker runs. */
async function siteClient(): Promise<SiteClient> {
  const server = new McpServer({ name: "encodings-docs", version: "0.0.0" });
  for (const tool of await siteTools()) {
    if (!tool.name.startsWith("encodings_")) continue;
    const handler = tool.handler as (args: unknown) => Promise<CallToolResult>;
    server.registerTool(tool.name, tool as never, handler);
  }
  const [clientTransport, serverTransport] = SiteTransport.createLinkedPair();
  const client = new SiteClient({ name: "encodings-docs-test", version: "0.0.0" });
  openConnections.push(client, server);
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe("docs MCP tools", () => {
  it("serves every tool `encodings mcp` lists after the Docus page tools", async () => {
    expect((await siteTools()).map((tool) => tool.name)).toEqual([
      "list-pages",
      "get-page",
      ...toolListings.map((tool) => tool.name),
    ]);
  });

  it("lists the names, titles, annotations and input schemas `encodings mcp` lists", async () => {
    const { tools } = await (await siteClient()).listTools();
    expect(
      tools.map(({ name, title, description, annotations, inputSchema }) => ({
        name,
        title,
        description,
        annotations,
        inputSchema,
      })),
    ).toEqual(
      toolListings.map(({ name, title, description, annotations, inputSchema }) => ({
        name,
        title,
        description,
        annotations,
        inputSchema: { $schema: "http://json-schema.org/draft-07/schema#", ...inputSchema },
      })),
    );
  });

  it("answers like `encodings mcp`, a typo in the arguments included", async () => {
    const client = await siteClient();
    const args = { encoding: "base58", text: "2NEpo7TZRRrLZSi2U" };
    const served = await client.callTool({ name: "encodings_decode", arguments: args });
    expect(served.isError).toBeFalsy();
    expect(served.content).toEqual((await callTool("encodings_decode", args)).content);

    const typo = { encodng: "base58", input: "Hello World!" };
    const refused = await client.callTool({ name: "encodings_encode", arguments: typo });
    expect(refused.isError).toBe(true);
    expect(refused.content).toEqual((await callTool("encodings_encode", typo)).content);
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
