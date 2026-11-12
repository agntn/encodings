/** The text every panel encodes: twelve bytes, so Z85 takes it and base32 still pads. */
export const SAMPLE_INPUT = "hello world!";

/** Options a page encodes the sample with, where the encoding needs any. */
export const SAMPLE_OPTIONS: Readonly<Record<string, Record<string, string | number | boolean>>> = {
  bech32: { prefix: "hi" },
  prefix: { codebook: "A=0 B=10 R=110 C=1110 D=1111" },
};

/** What a page encodes instead of `hello world!`: a teleprinter can't type it, and a codebook
 * of five letters reads better than one of nine. */
const SAMPLE_INPUTS: Readonly<Record<string, string>> = {
  ita2: "HELLO WORLD?",
  prefix: "ABRACADABRA",
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

/**
 * The sample options decoding takes back, such as prefix's codebook.
 *
 * @param {string} slug - A built-in name.
 * @param {ReadonlyArray<{ name: string; decode?: boolean }>} declared - The encoding's options.
 * @returns {Record<string, string | number | boolean>} The options marked `decode`.
 */
export function sampleDecodeOptions(
  slug: string,
  declared: ReadonlyArray<{ readonly name: string; readonly decode?: boolean }>,
): Record<string, string | number | boolean> {
  const sample = Object.hasOwn(SAMPLE_OPTIONS, slug) ? SAMPLE_OPTIONS[slug]! : {};
  const reads = new Set(declared.filter((option) => option.decode === true).map((option) => option.name));
  return Object.fromEntries(Object.entries(sample).filter(([name]) => reads.has(name)));
}
