import { describe, expect, it } from "vite-plus/test";
import { create, encodings } from "../src/index.ts";
import { SAMPLE_OPTIONS, sampleInput } from "../docs/app/utils/samples.ts";

describe("docs samples", () => {
  /* A sample an encoding can't write breaks its page and the playground select. */
  it.each(encodings())("%s writes its sample and reads it back", (name) => {
    const encoding = create(name);
    const input = sampleInput(name);
    const text = encoding.encode(input, SAMPLE_OPTIONS[name] ?? {});
    expect(new TextDecoder().decode(encoding.decode(text).bytes)).toBe(input);
  });
});
