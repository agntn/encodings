import { camelCase, kebabCase } from "scule";

/** The fields of an argument definition that tell an option from text. */
type Declared = Readonly<{ type?: string; alias?: string | readonly string[] }>;

/**
 * Mirrors citty's `runMain`: an exact `--help` or `-h` anywhere, or a lone `--version` or `-v`.
 *
 * @param args - Every argument after the bin.
 * @returns {boolean} Whether citty prints usage or the version without parsing anything.
 */
export function cittyAnswers(args: readonly string[]): boolean {
  if (args.some((arg) => arg === "--help" || arg === "-h")) return true;
  return args.length === 1 && (args[0] === "--version" || args[0] === "-v");
}

/**
 * Maps every name citty takes for an option of the command to whether it takes a value.
 *
 * @param defs - The command's argument definitions.
 * @returns {Record<string, boolean>} Names, scule's two spellings, aliases and `no-` forms.
 */
function optionNames(defs: Readonly<Record<string, Declared>>): Record<string, boolean> {
  const names: Record<string, boolean> = {};
  for (const [key, def] of Object.entries(defs)) {
    if (def.type === "positional") continue;
    for (const name of [key, camelCase(key), kebabCase(key), ...[def.alias ?? []].flat()]) {
      names[name] = def.type !== "boolean";
      names[`no-${name}`] = false;
    }
  }
  return names;
}

/**
 * Reads a group of short options the way `util.parseArgs` does: a value-taking one ends the group.
 *
 * @param letters - The group without its leading `-`.
 * @param names - What `optionNames` returned.
 * @returns {boolean | undefined} Whether the next argument is a value, `undefined` for no option.
 */
function shortGroup(
  letters: string,
  names: Readonly<Record<string, boolean>>,
): boolean | undefined {
  for (let index = 0; index < letters.length; index++) {
    const letter = letters.charAt(index);
    if (!Object.hasOwn(names, letter)) return undefined;
    if (names[letter] === true) return index === letters.length - 1;
  }
  return false;
}

/**
 * Tells whether a dashed argument takes the next one as its value.
 *
 * @param arg - One argument, longer than `-`.
 * @param names - What `optionNames` returned.
 * @returns {boolean | undefined} `undefined` when the argument names no option.
 */
function takesValue(arg: string, names: Readonly<Record<string, boolean>>): boolean | undefined {
  if (!arg.startsWith("--")) return shortGroup(arg.slice(1), names);
  const [name = "", ...value] = arg.slice(2).split("=");
  if (!Object.hasOwn(names, name)) return undefined;
  return names[name] === true && value.length === 0;
}

/**
 * Finds a dashed argument before `--` that names no option, the kind citty chokes on (`-_8`).
 *
 * @param args - The arguments after the command name.
 * @param defs - The command's argument definitions.
 * @returns {string | undefined} The argument, or `undefined` when every dash is an option.
 */
export function undeclaredOption(
  args: readonly string[],
  defs: Readonly<Record<string, Declared>>,
): string | undefined {
  const names = optionNames(defs);
  let value = false;
  for (const arg of args) {
    if (arg === "--") return undefined;
    if (value || arg === "-" || !arg.startsWith("-")) {
      value = false;
      continue;
    }
    const next = takesValue(arg, names);
    if (next === undefined) return arg;
    value = next;
  }
  return undefined;
}
