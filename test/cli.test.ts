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

/** Every test here starts a handful of CLI processes, which ran 4.7 s of 5 on a CI runner. */
describe("encodings CLI", { timeout: 20_000 }, () => {
  it("prints the usage and its errors without colors into a pipe", () => {
    const help = run("--help");
    const usage = run("encode", "--help");
    const unknown = run("nope");

    expect(help.stdout).toMatch(/^ {2}encode {4}Write text or bytes in an encoding$/mu);
    expect(help.stdout).toMatch(/^ {2}mcp {7}Run the encodings MCP server over stdio$/mu);
    expect(usage.stdout).toContain("USAGE encodings encode [OPTIONS] <ENCODING> <INPUT>");
    expect(unknown).toMatchObject({
      code: 1,
      stderr: 'Unknown command "nope"\nRun encodings --help for the commands\n',
    });
    for (const output of [help, usage, unknown]) {
      expect(output.stdout + output.stderr).not.toContain("\u001B");
    }
  });

  it("encodes text, bytes and stdin", () => {
    expect(run("encode", "base64", "Hello")).toMatchObject({ code: 0, stdout: "SGVsbG8=\n" });
    expect(
      run(
        "encode",
        "base58",
        "0062e907b15cbf27d5425399ebf6f0fb50ebb88f18",
        "--input-format",
        "hex",
        "--check",
      ).stdout,
    ).toBe("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa\n");
    expect(runWith("Hi", "encode", "binary", "-", "--no-separate").stdout).toBe(
      "0100100001101001\n",
    );
    expect(runWith(Uint8Array.of(0xff, 0x00), "encode", "hex", "-").stdout).toBe("ff00\n");
    expect(run("encode", "hex", "A", "--upper").stdout).toBe("41\n");
    expect(run("encode", "base32", "f", "--no-padding").stdout).toBe("MY\n");
    expect(run("encode", "base32", "f", "--alphabet", "hex").stdout).toBe("CO======\n");
    expect(run("encode", "base32", "f", "--alphabet=crockford").stdout).toBe("CR\n");
    expect(
      run(
        "encode",
        "base64",
        "+/8",
        "--input-format",
        "base64",
        "--alphabet",
        "url",
        "--no-padding",
      ).stdout,
    ).toBe("-_8\n");
    expect(run("decode", "base32", "CO", "--alphabet", "hex").stdout).toBe("f");
    expect(run("decode", "binary", "abaabaaa", "--symbols", "ab").stdout).toBe("H");
    expect(run("decode", "base256", "🚀😝🌈🌷😝", "--multibase").stdout).toBe("gsmg");
    expect(run("decode", "base256", "ᚢᚠ", "--sample", "ᚠᚢ", "-o", "hex").stdout).toBe("0100\n");
    expect(run("encode", "base256", "gsmg", "--multibase").stdout).toBe("🚀😝🌈🌷😝\n");
    expect(run("decode", "binary", "0001001", "--bits=7", "--order", "lsb").stdout).toBe("H");
    expect(run("encode", "binary", "Hi", "--bits", "7", "--symbols", "ab").stdout).toBe(
      "baabaaa bbabaab\n",
    );
    expect(run("decode", "base64", "__s", "--alphabet", "url", "-o", "hex").stdout).toBe("fffb\n");
    expect(run("decode", "base85", "<~z~>", "--alphabet", "ascii85", "-o", "hex").stdout).toBe(
      "00000000\n",
    );
    const taproot = run("encode", "bech32", "hi", "--prefix", "test", "--m").stdout.trim();
    expect(run("decode", "bech32", taproot, "--m").stdout).toBe("hi");
    expect(run("encode", "bech32", "hi", "--prefix", "test").stdout).toMatch(/^test1/u);
  });

  it("refuses an option the encoding does not take, or a value it cannot use", () => {
    expect(run("decode", "binary", "0", "--bits", "seven")).toMatchObject({
      code: 1,
      stderr: "Invalid arguments at --bits: must be integer\n",
    });
    expect(run("decode", "base58", "2g", "--alphabet", "z")).toMatchObject({
      code: 1,
      stdout: "",
      stderr: "Invalid option alphabet=z: use one of bitcoin, flickr, ripple\n",
    });
    expect(run("decode", "base32", "CO", "--check")).toMatchObject({
      code: 1,
      stderr: "Invalid option check=true: base32 does not take it\n",
    });
    expect(run("encode", "base64", "x", "--prefix", "bc")).toMatchObject({
      code: 1,
      stderr: "Invalid option prefix=bc: base64 does not take it\n",
    });
    expect(run("decode", "base64", "SGk=", "--padding")).toMatchObject({ code: 1, stdout: "" });
  });

  it("writes decoded bytes raw, or as hex with the details on stderr", () => {
    expect(run("decode", "base64", "SGVsbG8=")).toMatchObject({ code: 0, stdout: "Hello" });
    expect(runWith("SGVsbG8=\n", "decode", "base64", "-").stdout).toBe("Hello");
    expect(runWith("AP8=\n", "decode", "base64", "-").stdout).toBe("\u0000\uFFFD");
    expect(
      run("decode", "bech32", "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4", "-o", "hex"),
    ).toMatchObject({
      code: 0,
      stdout: "751e76e8199196d454941c45d1b3a323f1433bd6\n",
      stderr: "prefix: bc\nwitnessVersion: 0\n",
    });
    expect(run("decode", "hex", "6869", "-o", "base64").stdout).toBe("aGk=\n");
  });

  it("ranks candidates, one per entry, and fails when nothing decodes", () => {
    const { code, stdout } = run("identify", "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", "-n", "2");
    expect(code).toBe(0);
    expect(stdout.split("\n")[0]).toMatch(/^1\. base58 \(check\) 0\.\d{3}; checksum matches$/u);
    expect(stdout.split("\n").filter((line) => /^\d+\. /u.test(line))).toHaveLength(2);
    expect(runWith("SGk=\n", "identify", "-", "-n", "1").stdout).toContain('2 bytes, text "Hi"\n');
    expect(run("identify", "€€€")).toMatchObject({
      code: 1,
      stdout: "",
      stderr: "No encoding decodes this text to anything but itself.\n",
    });
  });

  it("identifies past the caps the agent tool keeps", () => {
    const long = runWith("SGk=".padEnd(150_000, " "), "identify", "-", "-n", "1");
    expect(long).toMatchObject({ code: 0, stderr: "" });
    expect(long.stdout).toContain('2 bytes, text "Hi"');
    expect(run("identify", "SGk=", "-n", "25")).toMatchObject({ code: 0, stderr: "" });
  });

  it("prints the candidates as JSON with --json", () => {
    const { code, stdout } = run("identify", "SGk=", "-n", "1", "--json");
    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({ candidates: [{ encoding: "base64", text: "Hi" }] });
  });

  it("peels layers, outermost first, and says when there is none", () => {
    const { code, stdout } = run("identify", "--peel", "553246736447566b58312b786c723668");
    expect(code).toBe(0);
    const [heading, first, text] = stdout.split("\n");
    expect(heading).toBe("2 layers, outermost first:");
    expect(first).toMatch(/^1\. hex 0\.\d{3}; /u);
    expect(text).toBe('   16 bytes, text "U2FsdGVkX1+xlr6h"');
    expect(stdout.split("\n")[3]).toMatch(/^2\. base64 \(unconfirmed guess\) 0\.\d{3}/u);
    expect(run("identify", "--peel", "553246736447566b58312b786c723668", "-n", "1").stdout).toMatch(
      /^1 layer/u,
    );
    expect(run("identify", "--peel", "Hello world")).toMatchObject({
      code: 1,
      stdout: "",
      stderr:
        "No layer to take off: nothing decodes this text to readable text or past a checksum.\n",
    });
  });

  it("shows the text a peeled layer hands down, control characters escaped", () => {
    expect(
      run("identify", "--peel", "5958523059574e720c49474630494752686432343d").stdout.split("\n")[2],
    ).toBe(String.raw`   21 bytes, text "YXR0YWNr\fIGF0IGRhd24="`);
  });

  it("names the options a candidate needs to decode", () => {
    expect(run("identify", "CPNMUOG=", "-n", "1").stdout).toMatch(
      /^1\. base32 \(alphabet=hex\) 0\.\d{3}; .*\n {3}4 bytes, text "foob"\n$/u,
    );
  });

  it("writes HTML references, past ASCII too with --ascii", () => {
    expect(run("encode", "html", "café <3").stdout).toBe("café &lt;3\n");
    expect(run("encode", "html", "café <3", "--ascii").stdout).toBe("caf&#xE9; &lt;3\n");
  });

  it("lists encodings and shows one", () => {
    expect(run("list").stdout.trim().split("\n")).toHaveLength(15);
    expect(run("list", "--family", "base64").stdout.trim().split("\n")).toHaveLength(1);
    expect(run("list", "bech32").stdout).toContain(
      "prefix (string, required): Human-readable part",
    );
    expect(run("list", "base64").stdout).toContain("url (- and _, safe in URLs and file names)");
    expect(run("list", "--family", "nope")).toMatchObject({ code: 1, stdout: "" });
    expect(run("list", "--version")).toMatchObject({
      code: 1,
      stdout: "",
      stderr: 'Invalid arguments: unknown option "--version"; takes --family, --json\n',
    });
  });

  it("converts between code pages, from an argument or stdin", () => {
    expect(run("convert", "HELLO", "--from", "ibm037", "--to", "hex")).toMatchObject({
      code: 0,
      stdout: "c8c5d3d3d6\n",
    });
    expect(run("convert", "c8c5d3d3d6", "--from", "hex", "--to", "ibm037").stdout).toBe("HELLO\n");
    expect(runWith("ÃƒÂ©\n", "convert", "-", "--from", "windows1252").stdout).toBe("Ã©\n");
    expect(
      runWith(Uint8Array.of(0xc8, 0x89), "convert", "-", "--from", "raw", "--to", "ibm037").stdout,
    ).toBe("Hi\n");
    expect(run("convert", "ÿ", "--from", "latin1", "--to", "raw").stdout).toBe("\uFFFD");
    expect(run("convert", "a€", "--from", "ibm037")).toMatchObject({
      code: 1,
      stderr: 'ibm037: "€" (U+20AC) at index 1 has no byte\n',
    });
    expect(run("convert", "x", "--from", "cp037").stderr).toMatch(
      /^Invalid arguments at --from: must be one of raw, utf8, hex, base64, ibm037/u,
    );
  });

  it("turns library errors into one line on stderr and exit code 1", () => {
    expect(run("decode", "base58", "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb", "--check")).toMatchObject({
      code: 1,
      stdout: "",
      stderr: "base58: checksum does not match\n",
    });
    expect(run("encode", "base85", "hi", "--alphabet", "z85")).toMatchObject({
      code: 1,
      stderr: "base85: 2 bytes are not a multiple of 4, as Z85 needs\n",
    });
    expect(run("encode", "base62", "x").stderr).toMatch(/^Unknown encoding: base62\. Available: /u);
    expect(run("decode", "base64", "YR==", "--canonical")).toMatchObject({
      code: 1,
      stdout: "",
      stderr: 'base64: "R" (U+0052) at index 1 leaves non-zero bits after the last byte\n',
    });
    expect(run("decode", "base64", "YQ==", "--canonical")).toMatchObject({ code: 0, stdout: "a" });
  });

  it("reads text that starts with a dash as text, and a typo after it as a typo", () => {
    expect(run("decode", "base64", "-_8", "--alphabet", "url", "-o", "hex")).toMatchObject({
      code: 0,
      stdout: "fbff\n",
    });
    expect(run("decode", "base85", "--alphabet", "ascii85", "-Y7,")).toMatchObject({
      code: 0,
      stdout: "'em",
    });
    expect(run("encode", "base64", "-x").stdout).toBe("LXg=\n");
    expect(run("encode", "bech32", "hi", "--prefix", "-x").stdout).toBe("-x1dp5s5yzjlm\n");
    const typo = run("decode", "base64", "SGk=", "--outptu", "hex");
    expect(typo).toMatchObject({ code: 1, stdout: "" });
    expect(typo.stderr).toMatch(
      /^Invalid arguments: unknown option "--outptu"; takes --output \(-o\), /u,
    );
    expect(run("encode", "--x", "base64").stderr).toMatch(
      /^Invalid arguments: unknown option "--x"; /u,
    );
    expect(run("decode", "-o", "hex", "--alphabet", "ascii85", "--", "base85", "-Y7,").stdout).toBe(
      "27656d\n",
    );
    expect(run("encode", "hex", "--", "-h").stdout).toBe("2d68\n");
  });

  it("takes options in their documented spelling only", () => {
    expect(run("decode", "base64", "SGk=", "--output=hex").stdout).toBe("4869\n");
    const camel = run("encode", "hex", "6869", "--inputFormat", "hex");
    expect(camel.code).toBe(1);
    expect(camel.stderr).toMatch(
      /^Invalid arguments: unknown option "--inputFormat"; takes --input-format, /u,
    );
    expect(run("decode", "base64", "SGk=", "-ohex")).toMatchObject({ code: 1, stdout: "" });
    expect(run("decode", "-h")).toMatchObject({ code: 0 });
    expect(run("-v")).toMatchObject({ code: 0 });
  });

  it("writes details from the text escaped, so they cannot drive the terminal", () => {
    const ESC = String.fromCodePoint(27);
    const text = `begin 644 a${ESC}]0;pwned${String.fromCodePoint(7)}\n#0V%T\n\`\nend\n`;
    const { code, stderr } = run("decode", "uuencode", text);
    expect(code).toBe(0);
    expect(stderr).not.toContain(ESC);
    expect(stderr).toContain(String.raw`name: "a\u001b]0;pwned\u0007"`);
    expect(run("decode", "base64", `-${ESC}]0;x\u0007`).stderr).not.toContain(ESC);
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
  const bundle = urls.some((url) => url.endsWith("/@agntn/tools/dist/mcp.mjs"));
  let from: "bundle" | "source" | "unknown" = "unknown";
  if (source) from = "source";
  else if (bundle) from = "bundle";
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
      for (const entry of ["dist", "extensions", "package.json"]) {
        cpSync(join(root, entry), join(packaged, entry), { recursive: true });
      }
      symlinkSync(join(root, "node_modules"), join(packaged, "node_modules"), "dir");
      expect(serve(packaged)).toMatchObject(served("bundle"));
    } finally {
      rmSync(packaged, { recursive: true, force: true });
    }
  });
});
