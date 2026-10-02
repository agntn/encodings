import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { registerPiTools } from "@agntn/tools/pi";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import type * as EncodingTools from "../../../dist/tools.d.mts";

const sourceModuleUrl = new URL("../../../src/tools.ts", import.meta.url);
const distributionModuleUrl = new URL("../../../dist/tools.mjs", import.meta.url);

/**
 * Loads the tool definitions, from the source in a checkout and the build in the package.
 *
 * @returns {Promise<typeof EncodingTools>} The definitions and the executor loader.
 */
function loadTools(): Promise<typeof EncodingTools> {
  return import(
    existsSync(fileURLToPath(sourceModuleUrl)) ? sourceModuleUrl.href : distributionModuleUrl.href
  ) as Promise<typeof EncodingTools>;
}

/**
 * Registers the encoding tools; the executors load on the first call.
 *
 * @param pi - Pi extension API.
 */
export default async function encodingsExtension(pi: ExtensionAPI): Promise<void> {
  const { encodingTools } = await loadTools();
  registerPiTools(pi, encodingTools);
}
