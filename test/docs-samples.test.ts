import { describe, expect, it } from "vite-plus/test";
import { create, encodings } from "../src/index.ts";
import { SAMPLE_OPTIONS, sampleDecodeOptions, sampleInput } from "../docs/app/utils/samples.ts";

describe("docs samples", () => {
  /* A sample an encoding can't write breaks its page and the playground select. */
  it.each(encodings())("%s writes its sample and reads it back", (name) => {
    const encoding = create(name);
    const input = sampleInput(name);
    const text = encoding.encode(input, SAMPLE_OPTIONS[name] ?? {});
    const back = encoding.decode(text, sampleDecodeOptions(name, encoding.info().options));
    expect(new TextDecoder().decode(back.bytes)).toBe(input);
  });
});
