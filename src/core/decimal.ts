import { createNumbers } from "./numbers.ts";

/**
 * Bytes as decimal numbers from 0 to 255, spaced, as puzzles and ASCII tables write them:
 * `72 105` is `Hi`. Decoding also takes commas, and three digits per byte with no separator.
 */
export const decimal = createNumbers({
  name: "decimal",
  radix: 10,
  notDigit: "is not a decimal digit",
});
