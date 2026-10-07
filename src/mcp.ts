import { indexTools, invokeTool, ToolInputError, wireSchema } from "@agntn/tools";
import {
  createMcpServer as createToolServer,
  errorResult,
  toolAnnotations,
} from "@agntn/tools/mcp";
import type { CallToolResult, Server, Tool } from "@modelcontextprotocol/server";
import { serverInfo } from "./server-info.ts";
import { encodingTools } from "./tools.ts";

/** The `tools/list` entries shared by `encodings mcp` and the MCP server of the docs site. */
export const toolListings: readonly Tool[] = encodingTools.map((tool) => ({
  name: tool.name,
  title: tool.title,
  description: tool.description,
  inputSchema: { ...wireSchema(tool), type: "object" },
  annotations: toolAnnotations(tool),
}));

const toolsByName = indexTools(encodingTools);

/**
 * Runs one tool the way `tools/call` of `encodings mcp` does, errors as results, never as a throw.
 *
 * @param {string} name - The tool's name, such as `encodings_decode`.
 * @param {Readonly<Record<string, unknown>>} args - The arguments the client sent.
 * @param {Readonly<AbortSignal>} [signal] - The request's signal, passed to the tool as is.
 * @returns {Promise<CallToolResult>} The tool's text, or the sanitized error.
 */
export async function callTool(
  name: string,
  args: Readonly<Record<string, unknown>>,
  signal?: Readonly<AbortSignal>,
): Promise<CallToolResult> {
  const tool = toolsByName.get(name);
  if (!tool) return errorResult(`Unknown encodings tool: ${JSON.stringify(name)}`);
  try {
    const result = await invokeTool(tool, args, signal === undefined ? {} : { signal });
    return {
      content: result.content,
      ...(result.isError === undefined ? {} : { isError: result.isError }),
    };
  } catch (error) {
    if (error instanceof ToolInputError) return errorResult(...error.lines);
    return errorResult(
      `${tool.name} failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Creates an unconnected MCP server exposing the encoding tools.
 *
 * @returns {Server} Unconnected MCP server.
 */
export function createMcpServer(): Server {
  return createToolServer(serverInfo, encodingTools);
}
