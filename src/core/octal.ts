import { createNumbers } from "./numbers.ts";

/**
 * Bytes as octal numbers from 0 to 377, spaced: `110 151` is `Hi`. Decoding also takes commas,
 * and three digits per byte with no separator.
 */
export const octal = createNumbers({
  name: "octal",
  radix: 8,
  notDigit: "is not an octal digit",
});
