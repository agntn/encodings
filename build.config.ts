import { defineBuildConfig } from "obuild/config";

/** One subpath per family, so a caller that needs base58 loads base58 without the registry. */
export const familyEntries = [
  "binary",
  "octal",
  "decimal",
  "hex",
  "base32",
  "base45",
  "base58",
  "base64",
  "base85",
  "base91",
  "base256",
  "bech32",
  "uuencode",
  "quoted-printable",
] as const;

/** Subpaths with no registry entry: code pages read bytes as text in another character set. */
export const standaloneEntries = ["charsets"] as const;

export default defineBuildConfig({
  entries: [
    {
      /** One bundle, so every entry shares the registry the MCP server reads. */
      type: "bundle",
      input: [
        "./src/index.ts",
        "./src/cli.ts",
        "./src/ai.ts",
        "./src/mcp.ts",
        "./src/tools.ts",
        ...[...familyEntries, ...standaloneEntries].map((name) => `./src/${name}.ts`),
      ],
    },
  ],
});
