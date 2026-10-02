import { create, hex } from "@agntn/encodings";
import { ENCODINGS, SAMPLE_OPTIONS, alphabetCells, type EncodingEntry } from "../utils/encodings";

/** The text every panel encodes: twelve bytes, so Z85 takes it and base32 still pads. */
export const SAMPLE_INPUT = "hello world!";

/** The order the landing walks the encodings in. Neighbours are kept different on purpose. */
const ORDER: readonly EncodingEntry["slug"][] = [
  "base64",
  "base58",
  "hex",
  "bech32",
  "base32",
  "ascii85",
  "base58check",
  "z-base-32",
  "base91",
  "base45",
  "z85",
  "base32-crockford",
  "binary",
  "bech32m",
  "base58-ripple",
  "quoted-printable",
  "base58-flickr",
  "uuencode",
];

/** Every built-in, in `ORDER` first; a newcomer missing from it joins at the end. */
const WALK: readonly EncodingEntry[] = [
  ...ORDER.map((slug) => ENCODINGS.find((row) => row.slug === slug)!),
  ...ENCODINGS.filter((row) => !ORDER.includes(row.slug)),
];

export interface LandingSample {
  entry: EncodingEntry;
  /** `SAMPLE_INPUT` in this encoding. */
  text: string;
  /** The bytes of `SAMPLE_INPUT`, in hex. */
  bytesHex: string;
  /** The alphabet as cells, and which of them the text uses. */
  cells: ReadonlyArray<{ character: string; used: boolean }>;
  /** How many alphabet characters the text uses. */
  usedCount: number;
  /** Characters out per byte in, as a percentage over 100: base64 is 33. */
  overhead: number;
  /** Options the sample is encoded with, as `info()` would spell them in a call. */
  options: Readonly<Record<string, string | number | boolean>>;
}

/**
 * Encodes the sample with one encoding and lines the result up against its alphabet.
 *
 * @param {EncodingEntry} entry - A built-in.
 * @returns {LandingSample} The text, its overhead and the alphabet cells it lights.
 */
export function encodeSample(entry: EncodingEntry): LandingSample {
  const options = SAMPLE_OPTIONS[entry.slug] ?? {};
  const text = create(entry.slug).encode(SAMPLE_INPUT, options);
  const used = new Set(text.replaceAll(/\t/gu, "⇥"));
  const cells = alphabetCells(entry.info).map((character) => ({ character, used: used.has(character) }));
  const bytes = new TextEncoder().encode(SAMPLE_INPUT);
  const body = text.replaceAll(/\s/gu, "").length;
  return {
    entry,
    text,
    bytesHex: hex.encode(bytes),
    cells,
    usedCount: cells.filter((cell) => cell.used).length,
    overhead: Math.round((body / bytes.length - 1) * 100),
    options,
  };
}

/** One clock for every landing panel. The library computes the samples, at build and live. */
export function useLandingSample() {
  const samples = WALK.map((entry) => encodeSample(entry));
  const tick = ref(0);
  const paused = ref(false);
  const index = computed(() => tick.value % samples.length);
  const current = computed(() => samples[index.value]!);

  let timer: number | undefined;

  /** Wraps at both ends, so previous on the first encoding lands on the last one. */
  function step(delta: number) {
    tick.value = (tick.value + delta + samples.length) % samples.length;
  }

  function stopWalk() {
    if (timer !== undefined) {
      window.clearInterval(timer);
      timer = undefined;
    }
  }

  function startWalk() {
    stopWalk();
    if (!import.meta.client || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    timer = window.setInterval(() => {
      if (!paused.value && !document.hidden) {
        step(1);
      }
    }, 4200);
  }

  onMounted(startWalk);
  onUnmounted(stopWalk);

  return { samples, tick, index, paused, current, step };
}
