import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vite-plus/test";

const switches = new Set([
  "CI",
  "FORCE_COLOR",
  "NO_COLOR",
  "NODE_DISABLE_COLORS",
  "ENCODINGS_DIST",
  "TEST",
]);
const env = {
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !switches.has(key))),
  TERM: "xterm-256color",
};

function run(...args: readonly string[]) {
  return runWith(undefined, ...args);
}

function runWith(input: string | Uint8Array | undefined, ...args: readonly string[]) {
  const { status, stderr, stdout } = spawnSync(process.execPath, ["src/cli.ts", ...args], {
    encoding: "utf8",
    env,
    input,
  });
  return { code: status, stderr, stdout };
}

describe("encodings CLI", () => {
  it("prints the usage and citty's errors without colors into a pipe", () => {
    const help = run("--help");
    const usage = run("encode", "--help");
    const unknown = run("nope");

    expect(help.stdout).toContain("USAGE encodings encode|decode|identify|list|mcp");
    expect(usage.stdout).toContain("ENCODING");
    expect(unknown).toMatchObject({ code: 1, stderr: "Unknown command nope\n" });
    for (const output of [help, usage, unknown]) {
      expect(output.stdout + output.stderr).not.toContain("\u001B");
    }
  });

  it("encodes text, bytes and stdin", () => {
    expect(run("encode", "base64", "Hello")).toMatchObject({ code: 0, stdout: "SGVsbG8=\n" });
    expect(
      run(
        "encode",
        "base58check",
        "0062e907b15cbf27d5425399ebf6f0fb50ebb88f18",
        "--input-format",
        "hex",
      ).stdout,
    ).toBe("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa\n");
    expect(runWith("Hi", "encode", "binary", "-", "--no-separate").stdout).toBe(
      "0100100001101001\n",
    );
    expect(run("encode", "hex", "A", "--upper").stdout).toBe("41\n");
    expect(run("encode", "base32", "f", "--no-padding").stdout).toBe("MY\n");
    expect(run("encode", "bech32", "hi", "--prefix", "test").stdout).toMatch(/^test1/u);
  });

  it("writes decoded bytes raw, or as hex with the details on stderr", () => {
    expect(run("decode", "base64", "SGVsbG8=")).toMatchObject({ code: 0, stdout: "Hello" });
    expect(runWith("SGVsbG8=\n", "decode", "base64", "-").stdout).toBe("Hello");
    expect(
      run("decode", "bech32", "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4", "-o", "hex"),
    ).toMatchObject({
      code: 0,
      stdout: "751e76e8199196d454941c45d1b3a323f1433bd6\n",
      stderr: "prefix: bc\nwitnessVersion: 0\n",
    });
  });

  it("ranks candidates, one per line", () => {
    const { code, stdout } = run("identify", "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", "-n", "2");
    expect(code).toBe(0);
    expect(stdout.split("\n")[0]).toMatch(/^0\.\d{3} {2}base58check {6}/u);
    expect(stdout.trim().split("\n")).toHaveLength(2);
  });

  it("lists encodings and shows one", () => {
    expect(run("list").stdout.trim().split("\n")).toHaveLength(20);
    expect(run("list", "--family", "base64").stdout.trim().split("\n")).toHaveLength(2);
    expect(run("list", "bech32").stdout).toContain("--prefix  Human-readable part");
  });

  it("turns library errors into one line on stderr and exit code 1", () => {
    expect(run("decode", "base58check", "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb")).toMatchObject({
      code: 1,
      stdout: "",
      stderr: "base58check: checksum does not match\n",
    });
    expect(run("encode", "base64", "x", "--prefix", "bc")).toMatchObject({
      code: 1,
      stderr: "Invalid option prefix=bc: base64 does not take it\n",
    });
    expect(run("encode", "z85", "hi")).toMatchObject({
      code: 1,
      stderr: "z85: 2 bytes are not a multiple of 4\n",
    });
    expect(run("encode", "base62", "x").stderr).toMatch(/^Unknown encoding: base62\. Available: /u);
    expect(run("identify", "€€€")).toMatchObject({ code: 1, stdout: "" });
  });

  it("writes details from the text escaped, so they cannot drive the terminal", () => {
    const ESC = String.fromCodePoint(27);
    const text = `begin 644 a${ESC}]0;pwned${String.fromCodePoint(7)}\n#0V%T\n\`\nend\n`;
    const { code, stderr } = run("decode", "uuencode", text);
    expect(code).toBe(0);
    expect(stderr).not.toContain(ESC);
    expect(stderr).toContain(String.raw`name: "a\u001b]0;pwned\u0007"`);
  });
});

const root = fileURLToPath(new URL("..", import.meta.url));

/* Writes the module URLs the child loaded to `file` on exit; stderr cuts them at about 146 KB. */
function recordLoads(file: string) {
  return `data:text/javascript,${encodeURIComponent(`
  import { writeFileSync } from "node:fs";
  import { registerHooks } from "node:module";
  const loaded = [];
  registerHooks({
    load(url, context, nextLoad) {
      loaded.push(url);
      return nextLoad(url, context);
    },
  });
  process.on("exit", () => writeFileSync(${JSON.stringify(file)}, JSON.stringify(loaded)));
`)}`;
}

const initialize = `${JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "encodings-test", version: "1.0.0" },
  },
})}\n`;

/**
 * Runs `mcp` from a built bin, answers one initialize request and tells where the server came
 * from. stdin closes after the request, so the server exits on its own.
 * @param base - Package root the bin sits in.
 * @param extraEnv - Environment on top of the shared one.
 * @returns {{ code: number | null, from: string, name: string | undefined, stderr: string }} The
 * exit code, where the server came from, the server name from the reply and stderr.
 */
function serve(base: string, extraEnv: Readonly<Record<string, string>> = {}) {
  const record = mkdtempSync(join(tmpdir(), "encodings-loaded-"));
  const file = join(record, "loaded.json");
  let child;
  let loaded: unknown = [];
  try {
    child = spawnSync(
      process.execPath,
      ["--import", recordLoads(file), join(base, "dist/cli.mjs"), "mcp"],
      { encoding: "utf8", env: { ...env, ...extraEnv }, input: initialize, timeout: 20_000 },
    );
    if (existsSync(file)) loaded = JSON.parse(readFileSync(file, "utf8"));
  } finally {
    rmSync(record, { recursive: true, force: true });
  }
  const { status, stderr, stdout } = child;
  const urls = Array.isArray(loaded) ? loaded.filter((url) => typeof url === "string") : [];
  const source = urls.includes(pathToFileURL(join(base, "src/mcp.ts")).href);
  const bundle = urls.includes(pathToFileURL(join(base, "dist/_chunks/mcp.mjs")).href);
  let from: "bundle" | "source" | "unknown" = "unknown";
  if (source && !bundle) from = "source";
  if (bundle && !source) from = "bundle";
  const name = /"serverInfo":\{"name":"([^"]+)"/.exec(stdout)?.[1];
  return { code: status, from, name, stderr };
}

/**
 * A run that answered the initialize request.
 * @param from - Where the server has to come from.
 * @returns {{ code: number, from: string, name: string }} The fields `serve` has to match.
 */
function served(from: "bundle" | "source") {
  return { code: 0, from, name: "encodings" };
}

describe.skipIf(!existsSync(join(root, "dist/cli.mjs")))("encodings mcp from the built bin", () => {
  it("serves the live source inside a checkout", () => {
    expect(serve(root)).toMatchObject(served("source"));
  });

  it("keeps the bundle under ENCODINGS_DIST=1", () => {
    expect(serve(root, { ENCODINGS_DIST: "1" })).toMatchObject(served("bundle"));
  });

  it("keeps the bundle when the package sits under node_modules", () => {
    // Node refuses to strip types there, so a copy that ships `src` still takes the bundle.
    const cache = join(root, "node_modules/.cache");
    mkdirSync(cache, { recursive: true });
    const nested = mkdtempSync(join(cache, "encodings-cli-"));
    try {
      for (const entry of ["dist", "src", "package.json"]) {
        cpSync(join(root, entry), join(nested, entry), { recursive: true });
      }
      expect(serve(nested)).toMatchObject(served("bundle"));
    } finally {
      rmSync(nested, { recursive: true, force: true });
    }
  });

  it("keeps the bundle in a package that ships no src", () => {
    const packaged = mkdtempSync(join(tmpdir(), "encodings-cli-"));
    try {
      for (const entry of ["dist", "packages", "package.json"]) {
        cpSync(join(root, entry), join(packaged, entry), { recursive: true });
      }
      symlinkSync(join(root, "node_modules"), join(packaged, "node_modules"), "dir");
      expect(serve(packaged)).toMatchObject(served("bundle"));
    } finally {
      rmSync(packaged, { recursive: true, force: true });
    }
  });
});
