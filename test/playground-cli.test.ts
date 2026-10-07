import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";
import { commandLine, textLine } from "../docs/app/utils/format.ts";

const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

/* Runs a playground line through sh, with `encodings` standing for the CLI in src/. */
function shell(line: string) {
  const { status, stderr, stdout } = spawnSync(
    "sh",
    ["-c", `encodings() { "$ENCODINGS_NODE" "$ENCODINGS_CLI" "$@"; }; ${line}`],
    {
      encoding: "utf8",
      env: { ...process.env, ENCODINGS_CLI: cli, ENCODINGS_NODE: process.execPath },
    },
  );
  return { code: status, stderr, stdout: stdout.trim() };
}

describe("the playground's CLI line", { timeout: 20_000 }, () => {
  it("keeps the text ahead of the flags when it doesn't start with a dash", () => {
    expect(textLine("encodings encode base64", "hello world", ["--input-format hex", ""])).toBe(
      "encodings encode base64 'hello world' --input-format hex",
    );
  });

  it("ends the flags with -- before text that starts with a dash", () => {
    expect(commandLine("encodings decode base64", ["-_8"], ["-o hex", "--alphabet url"])).toBe(
      "encodings decode base64 -o hex --alphabet url -- -_8",
    );
  });

  it("encodes, decodes and converts text that starts with a dash", () => {
    expect(shell(textLine("encodings encode base64", "-x"))).toMatchObject({
      code: 0,
      stdout: Buffer.from("-x").toString("base64"),
    });
    expect(
      shell(textLine("encodings decode base64", "-_8", ["-o hex", "--alphabet url"])),
    ).toMatchObject({
      code: 0,
      stdout: Buffer.from("-_8", "base64url").toString("hex"),
    });
    expect(shell(textLine("encodings convert", "-x", ["--from utf8", "--to hex"]))).toMatchObject({
      code: 0,
      stdout: Buffer.from("-x").toString("hex"),
    });
  });

  it("identifies text that starts with a dash", () => {
    const identified = shell(textLine("encodings identify", "-_8", ["-n 3"]));
    expect(identified.code).toBe(0);
    expect(identified.stdout).toContain("base64 --alphabet=url");
  });

  it("pipes a lone dash, which the CLI reads as stdin", () => {
    expect(textLine("encodings encode base64", "-")).toBe(
      "printf %s - | encodings encode base64 -",
    );
    expect(shell(textLine("encodings encode base64", "-")).stdout).toBe(
      Buffer.from("-").toString("base64"),
    );
  });

  it("pipes -h and --help, which print usage even after --", () => {
    for (const text of ["-h", "--help"]) {
      expect(shell(textLine("encodings encode hex", text))).toMatchObject({
        code: 0,
        stdout: Buffer.from(text).toString("hex"),
      });
    }
  });
});
