import { toToolkitTools } from "@agntn/tools/toolkit";
import { defineMcpHandler, getMcpTools } from "@nuxtjs/mcp-toolkit/server";
import { serverInfo } from "../../../src/server-info.ts";
import { encodingTools } from "../../../src/tools.ts";

const siteTools = toToolkitTools(serverInfo, encodingTools);

/** Introduces itself like `encodings mcp`, and serves its tools after the Docus page tools. */
export default defineMcpHandler({
  ...serverInfo,
  tools: async (event) => [...(await getMcpTools({ event })), ...siteTools],
});
