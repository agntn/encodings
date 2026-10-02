import { defineCommand } from "citty";
import { quote } from "../core/errors.ts";
import { create, encodingInfos } from "../core/registry.ts";

export default defineCommand({
  meta: {
    name: "list",
    description: "List the encodings, or show one with its alphabet and options",
  },
  args: {
    encoding: { type: "positional", description: "Encoding to show", required: false },
    family: { type: "string", description: "Keep one family, such as base58" },
  },
  run({ args }) {
    if (args.encoding) {
      const info = create(args.encoding).info();
      const flagWidth = Math.max(10, ...info.options.map((option) => option.name.length + 4));
      const lines = [
        `${info.label} (${info.name})`,
        info.description,
        `family    ${info.family}`,
        `standard  ${info.standard}`,
        `alphabet  ${info.alphabet}`,
        `checksum  ${info.checksum ? "yes" : "no"}`,
        `padding   ${info.padding ? "yes" : "no"}`,
        ...info.options.map(
          (option) =>
            `${`--${option.name}`.padEnd(flagWidth)}${option.description}${option.required ? " (required)" : ""}`,
        ),
      ];
      process.stdout.write(`${lines.join("\n")}\n`);
      return;
    }
    const infos = encodingInfos(args.family);
    if (infos.length === 0) {
      process.stderr.write(`No encodings in family ${quote(String(args.family))}.\n`);
      process.exitCode = 1;
      return;
    }
    for (const info of infos) {
      process.stdout.write(`${info.name.padEnd(18)}${info.family.padEnd(18)}${info.description}\n`);
    }
  },
});
