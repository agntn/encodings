import { describe, expect, it } from "vite-plus/test";
import { cittyAnswers, undeclaredOption } from "../src/cli-args.ts";

const defs = {
  text: { type: "positional" },
  output: { type: "string", alias: "o" },
  inputFormat: { type: "string" },
  page_size: { type: "string" },
  separate: { type: "boolean", alias: "s" },
} as const;

describe("undeclaredOption", () => {
  it("catches the argument that crashes citty", () => {
    expect(undeclaredOption(["-_8"], {})).toBe("-_8");
    expect(undeclaredOption(["SGk=", "-_8"], defs)).toBe("-_8");
  });

  it("catches a typo citty would drop without a word", () => {
    expect(undeclaredOption(["--outptu", "hex"], defs)).toBe("--outptu");
    expect(undeclaredOption(["--constructor"], defs)).toBe("--constructor");
  });

  it("lets every spelling of a declared option through", () => {
    expect(
      undeclaredOption(
        ["--input-format", "hex", "--inputFormat=hex", "--output=-x", "-ohex", "--no-separate"],
        defs,
      ),
    ).toBeUndefined();
    expect(undeclaredOption(["--page-size", "2", "--pageSize", "3"], defs)).toBeUndefined();
  });

  it("knows no help or version of its own, since citty only takes their exact tokens", () => {
    expect(undeclaredOption(["--version"], {})).toBe("--version");
    expect(undeclaredOption(["--help=x"], {})).toBe("--help=x");
    expect(undeclaredOption(["-hh"], {})).toBe("-hh");
    expect(undeclaredOption(["--version", "list"], {})).toBe("--version");
  });

  it("gives a dashed value to the option that takes it", () => {
    expect(undeclaredOption(["--output", "-hex", "SGk="], defs)).toBeUndefined();
    expect(undeclaredOption(["-o", "-_8"], defs)).toBeUndefined();
  });

  it("reads a short group as parseArgs does, a value-taking letter ending it", () => {
    expect(undeclaredOption(["-sohex"], defs)).toBeUndefined();
    expect(undeclaredOption(["-so", "hex"], defs)).toBeUndefined();
    expect(undeclaredOption(["-sx"], defs)).toBe("-sx");
  });

  it("leaves a lone dash and everything after -- alone", () => {
    expect(undeclaredOption(["-"], defs)).toBeUndefined();
    expect(undeclaredOption(["--", "-_8", "--outptu"], defs)).toBeUndefined();
  });
});

describe("cittyAnswers", () => {
  it("matches the tokens citty's runMain answers before parsing", () => {
    expect(cittyAnswers(["list", "-h"])).toBe(true);
    expect(cittyAnswers(["-_8", "--help"])).toBe(true);
    expect(cittyAnswers(["-v"])).toBe(true);
    expect(cittyAnswers(["--version", "list"])).toBe(false);
    expect(cittyAnswers(["list", "--version"])).toBe(false);
    expect(cittyAnswers(["list", "--help=x"])).toBe(false);
  });
});
