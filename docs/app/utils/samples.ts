/** The text every panel encodes: twelve bytes, so Z85 takes it and base32 still pads. */
export const SAMPLE_INPUT = "hello world!";

/** Options a page encodes the sample with, where the encoding needs any. */
export const SAMPLE_OPTIONS: Readonly<Record<string, Record<string, string | number | boolean>>> = {
  bech32: { prefix: "hi" },
};

/** What a page encodes instead of `hello world!`, which a teleprinter can't type. */
const SAMPLE_INPUTS: Readonly<Record<string, string>> = {
  ita2: "HELLO WORLD?",
};

/**
 * The sample a page and the playground encode for one encoding.
 *
 * @param {string} slug - A built-in name.
 * @returns {string} `hello world!`, or the text that encoding can write instead.
 */
export function sampleInput(slug: string): string {
  return Object.hasOwn(SAMPLE_INPUTS, slug) ? SAMPLE_INPUTS[slug]! : SAMPLE_INPUT;
}
