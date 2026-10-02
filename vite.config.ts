import oxfmt from "@agntn/ox/oxfmt";
import oxlint from "@agntn/ox/oxlint";
import { defineConfig } from "vite-plus";

const readonlyParams = oxlint.rules?.["typescript/prefer-readonly-parameter-types"];
if (!Array.isArray(readonlyParams)) {
  throw new TypeError("@agntn/ox no longer configures typescript/prefer-readonly-parameter-types");
}
const [severity, options] = readonlyParams;

export default defineConfig({
  fmt: { ...oxfmt, ignorePatterns: ["/CHANGELOG.md", "docs"] },
  lint: {
    ...oxlint,
    rules: {
      ...oxlint.rules,
      "typescript/prefer-readonly-parameter-types": [
        severity,
        {
          ...options,
          allow: [
            ...(options?.allow ?? []),
            /* TypedArrays have no readonly form in the TS lib; codecs read bytes and never write them. */
            { from: "lib", name: "Uint8Array" },
            /* Encodings, codecs and results carry bytes and methods; nothing here writes to them. */
            {
              from: "file",
              name: [
                "About",
                "Base58Codec",
                "Bech32Codec",
                "Decoded",
                "Encoding",
                "EncodingCandidate",
                "EncodingInfo",
                "EncodingOption",
                "IdentifyCandidate",
                "PeelLayer",
                "Radix2Spec",
                "Scored",
                "ToolResult",
              ],
            },
            { from: "package", name: ["OmpResultView"], package: "@agntn/tools" },
          ],
        },
      ],
    },
    ignorePatterns: ["docs"],
  },
});
