import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { defineCommand } from "citty";
import { createMcpServer } from "../mcp.ts";

export default defineCommand({
  meta: {
    name: "mcp",
    description: "Run the encodings MCP server over stdio",
  },
  /** stdout belongs to the JSON-RPC frames, and one stray line there breaks the stream. */
  async run() {
    await createMcpServer().connect(new StdioServerTransport());
  },
});
