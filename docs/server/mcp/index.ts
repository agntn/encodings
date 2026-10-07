import { serverInfo } from "../../../src/server-info.ts";

/** Introduces itself like `encodings mcp`, with the Docus page tools beside the encoding ones. */
export default defineMcpHandler({ ...serverInfo });
