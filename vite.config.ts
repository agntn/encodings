import { readFileSync } from "node:fs";
import oxfmt from "@agntn/ox/oxfmt";
import oxlint from "@agntn/ox/oxlint";
import { defineConfig } from "vite-plus";

const readonlyParams = oxlint.rules?.["typescript/prefer-readonly-parameter-types"];
if (!Array.isArray(readonlyParams)) {
  throw new TypeError("@agntn/ox no longer configures typescript/prefer-readonly-parameter-types");
}
const [severity, options] = readonlyParams;

const { compilerOptions } = JSON.parse(
  readFileSync(new URL("tsconfig.json", import.meta.url), "utf8"),
) as { compilerOptions: { target?: string; verbatimModuleSyntax?: boolean } };

/** Root tsconfig for every transform: docs/tsconfig.json only points at a `.nuxt/` CI never has. */
const transformOverride: object = {
  tsconfig: {
    compilerOptions: {
      target: compilerOptions.target,
      verbatimModuleSyntax: compilerOptions.verbatimModuleSyntax,
    },
  },
};

export default defineConfig({
  oxc: { ...transformOverride },
  /** changelogen puts two spaces after a breaking ⚠️, oxfmt wants one. Nested ones still count. */
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
