import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { rolldown } from "vite/rolldown";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { familyEntries } from "../build.config.ts";

const root = join(import.meta.dirname, "..");
let packed = "";

/** A string only that family's code carries, so finding it elsewhere means a leak. */
const markers: Record<(typeof familyEntries)[number], string> = {
  binary: "is not a bit",
  octal: "is not an octal digit",
  decimal: "is not a decimal digit",
  hex: "is not a hex digit",
  base32: "ybndrfg8ejkmcpqxot1uwisza345h769",
  base45: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:",
  base58: "rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz",
  base64: "-_",
  base85: ".-:+=^!/*?&<>()[]{}@%$#",
  base91: "@[]^_`{|}~",
  bech32: "qpzry9x8gf2tvdw0s3jn54khce6mua7l",
  uuencode: "begin-base64",
  "quoted-printable": "must be escaped",
};

/** Strings of the registry and `identify`, which no family subpath should load. */
const registryMarkers = ["decodes to readable text", "Lightning invoices need more"];

/**
 * Builds the current source with `build.config.ts` into a directory inside the repo, never an
 * old `dist`; inside the repo so the bundle resolves `@agntn/hashes` from `node_modules`.
 */
beforeAll(() => {
  packed = mkdtempSync(join(root, "node_modules/.cache-encodings-bundle-"));
  const script = `
    import { build } from "obuild";
    import config from "./build.config.ts";
    const outDir = ${JSON.stringify(packed)};
    await build({
      ...config,
      cwd: ${JSON.stringify(root)},
      entries: config.entries.map((entry) => ({ ...entry, outDir, dts: false })),
    });
  `;
  const { status, stderr } = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: root,
    encoding: "utf8",
  });
  if (status !== 0) throw new Error(`obuild failed:\n${stderr}`);
}, 60_000);

afterAll(() => {
  if (packed) rmSync(packed, { recursive: true, force: true });
});

/**
 * Bundles a consumer of everything one built entry exports, minified.
 *
 * @param entry - Entry file name without extension.
 * @returns {Promise<string>} The bundle.
 */
async function bundle(entry: string): Promise<string> {
  const input = join(packed, `consumer-${entry}.mjs`);
  writeFileSync(input, `export * from ${JSON.stringify(join(packed, `${entry}.mjs`))};\n`);
  const build = await rolldown({ input, platform: "node", logLevel: "silent" });
  const { output } = await build.generate({ format: "esm", minify: true });
  return output.map((chunk) => ("code" in chunk ? chunk.code : "")).join("\n");
}

describe("family subpaths", () => {
  it.each(familyEntries)("%s carries its own codec and no other", async (family) => {
    const code = await bundle(family);
    expect(code).toContain(markers[family]);
    for (const [other, marker] of Object.entries(markers)) {
      if (other === family || markers[family].includes(marker)) continue;
      expect(code, `${family} pulled in ${other}`).not.toContain(marker);
    }
    for (const marker of registryMarkers) expect(code).not.toContain(marker);
  });

  it("keeps the root entry whole: the registry and every family", async () => {
    const code = await bundle("index");
    for (const marker of [...Object.values(markers), ...registryMarkers]) {
      expect(code).toContain(marker);
    }
  });
});
