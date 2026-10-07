import type { McpServerInfo } from "@agntn/tools/mcp";
import { version } from "./version.ts";

/** How both MCP servers introduce themselves, so a connector card says more than a name. */
export const serverInfo = {
  name: "encodings",
  version,
  description:
    "Hand it a weird string, it tells you what's inside. Base64, base58, bech32, Ascii85 and friends, layer by layer. Nothing you send gets kept.",
  icons: [
    { src: "https://encodings.agntn.dev/favicon.svg", mimeType: "image/svg+xml", sizes: ["any"] },
    { src: "https://encodings.agntn.dev/icon-512.png", mimeType: "image/png", sizes: ["512x512"] },
  ],
} satisfies McpServerInfo;
